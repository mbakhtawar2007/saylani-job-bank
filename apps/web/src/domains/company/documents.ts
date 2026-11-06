import 'server-only';
import type { CompanyPresignInput } from '@jobbank/shared';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { recordAudit, runCommand } from '@/domains/shared/audit';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/domains/shared/errors';
import { enforceRateLimit } from '@/domains/shared/rate-limit';
import {
  assertBranchAccess,
  assertPermission,
  isSuperAdmin,
  type Actor,
} from '@/domains/shared/scope';
import { db, type DbExecutor } from '@/lib/db';
import {
  assertUploadAllowed,
  buildObjectKey,
  deleteObject,
  detectContentType,
  getObjectPrefix,
  headObject,
  malwareScanner,
  presignDownload,
  presignUpload,
  scansEnforced,
  UploadRejectedError,
  type PresignedUpload,
} from '@/lib/s3/storage';
import { companyEditability } from './rules';
import {
  buildCompanyView,
  companyDocumentTypes,
  docs,
  loadCompany,
  requireOwnCompany,
  type CompanyRow,
  type CompanyView,
  type SignedIn,
} from './repository';
import { getCompanyOnboarding } from './staff';

const MB = 1024 * 1024;
const VIEW_LINK_SECONDS = 120;

export interface PresignedCompanyDocument {
  documentId: string;
  upload: PresignedUpload;
}

function assertDocumentEditable(row: CompanyRow): void {
  if (!companyEditability(row.status).documents) {
    throw new ForbiddenError(
      'Documents cannot be changed while a verifier is reviewing your company. Wait for their response.',
    );
  }
}

/**
 * Step 1 (shared): checks file against the document type's rules, creates a
 * PENDING_UPLOAD row, returns a presigned PUT the browser sends the file straight to.
 * Used by the employer's own upload and by the staff upload for onboarded companies —
 * the type allowlist, size limits, content-type locking and rate limit are identical.
 */
async function presignDocumentForCompany(
  ctx: SignedIn,
  row: CompanyRow,
  input: CompanyPresignInput,
): Promise<PresignedCompanyDocument> {
  if (!row.branchId) {
    throw new ConflictError('Set your head office location and branch before uploading documents');
  }
  assertDocumentEditable(row);
  const types = await companyDocumentTypes();
  const type = types.find((t) => t.code === input.typeCode && t.isActive);
  if (!type) throw new ValidationError([{ path: 'typeCode', message: 'Choose a document type' }]);
  try {
    assertUploadAllowed(input.contentType, input.sizeBytes, {
      contentTypes: type.meta.mimeTypes,
      maxSizeBytes: type.meta.maxSizeMb * MB,
    });
  } catch (error) {
    if (error instanceof UploadRejectedError) {
      throw new ValidationError([{ path: 'file', message: error.message }]);
    }
    throw error;
  }
  await enforceRateLimit(
    'company-upload',
    row.id,
    { limit: 30, windowSeconds: 3600 },
    'Too many uploads. Please try again in an hour.',
  );
  const key = buildObjectKey({
    branchId: row.branchId,
    entity: 'company',
    entityId: row.id,
    contentType: input.contentType,
  });
  // Not audited: nothing stored yet. The confirm step records the upload.
  const documentId = await runCommand(
    ctx,
    async ({ tx }) => {
      const [doc] = await tx
        .insert(docs)
        .values({
          companyId: row.id,
          typeCode: type.code,
          storageKey: key,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
        })
        .returning({ id: docs.id });
      return doc!.id;
    },
    { audited: false },
  );
  const upload = await presignUpload({
    key,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  });
  return { documentId, upload };
}

/** Step 1 for the employer: presign an upload for their own company. */
export async function presignMyCompanyDocument(
  ctx: SignedIn,
  input: CompanyPresignInput,
): Promise<PresignedCompanyDocument> {
  assertPermission(ctx.actor, 'company:register');
  const row = await requireOwnCompany(db, ctx.actor);
  return presignDocumentForCompany(ctx, row, input);
}

async function ownDocument(executor: DbExecutor, row: CompanyRow, documentId: string) {
  const [doc] = await executor
    .select()
    .from(docs)
    .where(and(eq(docs.id, documentId), eq(docs.companyId, row.id)));
  if (!doc) throw new NotFoundError('Document', documentId);
  return doc;
}

/**
 * Step 2 (shared): browser finished the PUT. Verify what actually landed in storage,
 * verify the file's magic bytes match its declared type, scan for malware, then make
 * it the current document of its type (superseding earlier uploads). Used by the
 * employer's own upload and by the staff upload for onboarded companies — storage
 * check, type check, scan handling, supersede and audit are identical.
 *
 * Outcomes: a magic-byte mismatch deletes the object and the row stays
 * PENDING_UPLOAD (company document statuses have no REJECTED value — the audit
 * row is the record, and the user re-uploads); an 'infected' scan marks the row
 * INFECTED and quarantines the object; a 'skipped' scan leaves the row
 * PENDING_UPLOAD with scanResult 'skipped' — never servable, never counted as
 * present — and the user retries confirm later, but ONLY in production (see
 * scansEnforced): in development/test 'skipped' is recorded and the upload
 * completes, because no scanner service exists yet. Only a 'clean' scan, or a
 * 'skipped' scan outside production, marks the document UPLOADED.
 */
async function confirmDocumentForCompany(
  ctx: SignedIn,
  row: CompanyRow,
  documentId: string,
): Promise<CompanyView> {
  const doc = await ownDocument(db, row, documentId);
  if (doc.status !== 'PENDING_UPLOAD') return buildCompanyView(db, row);
  assertDocumentEditable(row);

  const stored = await headObject(doc.storageKey);
  if (!stored) throw new ConflictError('We did not receive the file. Please upload it again.');
  if (stored.sizeBytes !== doc.sizeBytes || stored.contentType !== doc.contentType) {
    throw new ConflictError('The uploaded file does not match. Please upload it again.');
  }
  // The PUT's Content-Type header is attacker-controlled, so the stored bytes
  // themselves are the only trustworthy type signal. Check them before scanning.
  const prefix = await getObjectPrefix(doc.storageKey);
  const actualType = prefix ? detectContentType(prefix) : null;
  if (actualType !== doc.contentType) {
    // Delete the spoofed object first: a mismatched row must not leave a live
    // file in storage. If the delete itself fails, leave the row PENDING_UPLOAD
    // (propagate the error) so the user can retry.
    await deleteObject(doc.storageKey);
    await runCommand(ctx, async ({ tx, audit }) => {
      await tx.update(docs).set({ scanResult: 'skipped' }).where(eq(docs.id, doc.id));
      audit({
        action: 'company.document_type_mismatch',
        entityType: 'company',
        entityId: row.id,
        branchId: row.branchId,
        metadata: {
          documentId: doc.id,
          typeCode: doc.typeCode,
          declared: doc.contentType,
          detected: actualType ?? 'unknown',
        },
      });
    });
    throw new ConflictError(
      'The file contents do not match its type. Please upload the correct file.',
    );
  }
  const scan = await malwareScanner.scan(doc.storageKey);
  if (scan === 'infected') {
    // Best-effort quarantine: remove the object. Serving is already blocked
    // (INFECTED is not a present status, and viewLink refuses it), so a failed
    // delete is not fatal.
    await deleteObject(doc.storageKey).catch(() => undefined);
  }
  if (scan === 'skipped' && scansEnforced()) {
    // No scanner result in production: hold the upload. The row stays
    // PENDING_UPLOAD so the user can retry confirm once a scanner exists or
    // recovers; it is not counted as a present document and cannot be viewed
    // or downloaded. Outside production scansEnforced() is false, so this
    // branch is skipped and the upload completes with scanResult 'skipped'
    // recorded (see scansEnforced in lib/s3/storage.ts).
    await runCommand(ctx, async ({ tx, audit }) => {
      await tx.update(docs).set({ scanResult: 'skipped' }).where(eq(docs.id, doc.id));
      audit({
        action: 'company.document_scan_pending',
        entityType: 'company',
        entityId: row.id,
        branchId: row.branchId,
        metadata: { documentId: doc.id, typeCode: doc.typeCode },
      });
    });
    throw new ConflictError(
      'This file has not been virus-scanned yet. Please try again in a few minutes.',
    );
  }

  await runCommand(ctx, async ({ tx, audit }) => {
    if (scan === 'infected') {
      await tx
        .update(docs)
        .set({ status: 'INFECTED', scanResult: scan, reviewNote: 'The file failed a virus check' })
        .where(eq(docs.id, doc.id));
      audit({
        action: 'company.document_infected',
        entityType: 'company',
        entityId: row.id,
        branchId: row.branchId,
        metadata: { documentId: doc.id, typeCode: doc.typeCode },
      });
      return;
    }
    const now = new Date();
    // Company document types are single-document: supersede any earlier upload of the same type.
    const replaced = await tx
      .update(docs)
      .set({ replacedAt: now })
      .where(
        and(
          eq(docs.companyId, row.id),
          eq(docs.typeCode, doc.typeCode),
          ne(docs.id, doc.id),
          isNull(docs.replacedAt),
        ),
      )
      .returning({ id: docs.id });
    await tx
      .update(docs)
      .set({ status: 'UPLOADED', scanResult: scan, uploadedAt: now })
      .where(eq(docs.id, doc.id));
    // A replacement upload resets the verifier's per-document decision to PENDING.
    audit({
      action: 'company.document_upload',
      entityType: 'company',
      entityId: row.id,
      branchId: row.branchId,
      metadata: {
        documentId: doc.id,
        typeCode: doc.typeCode,
        sizeBytes: doc.sizeBytes,
        scan,
        replaced: replaced.map((r) => r.id),
      },
    });
  });
  if (scan === 'infected') {
    throw new ConflictError('This file failed a virus check and was not saved.');
  }
  return buildCompanyView(db, await loadCompany(db, row.id));
}

/** Step 2 for the employer: confirm an upload for their own company. */
export async function confirmMyCompanyDocument(
  ctx: SignedIn,
  documentId: string,
): Promise<CompanyView> {
  assertPermission(ctx.actor, 'company:register');
  const row = await requireOwnCompany(db, ctx.actor);
  return confirmDocumentForCompany(ctx, row, documentId);
}

// ─── Staff upload (F1) ─────────────────────────────────────────────────

/**
 * Gate for the staff upload path. A company qualifies only when staff onboarded it
 * after a field visit — the outreach record is the marker (see getCompanyOnboarding,
 * the same detector markCompanyRegistrationVerifiedSigned uses): employer
 * self-registered companies and legacy staff-registered companies carry no visit /
 * agreement record and are rejected here. Uploads happen while the company is still
 * a DRAFT, i.e. before the paper form is marked verified & signed; once the company
 * is with the verifier, documents are the verifier's to review, not staff's to
 * change. Branch scope matches staffOnboardCompany / markCompanyRegistrationVerifiedSigned:
 * Super Admin bypasses it, everyone else must be in the company's branch.
 */
async function loadStaffOnboardedCompany(ctx: SignedIn, companyId: string): Promise<CompanyRow> {
  assertPermission(ctx.actor, 'company:onboard');
  const row = await loadCompany(db, companyId);
  if (!isSuperAdmin(ctx.actor)) {
    assertBranchAccess(ctx.actor, row.branchId, { entityType: 'company', entityId: row.id });
  }
  const onboarding = await getCompanyOnboarding(ctx.actor, companyId);
  if (!onboarding) {
    throw new ForbiddenError(
      'Documents for this company can only be uploaded by the employer who registered it.',
    );
  }
  if (row.status !== 'DRAFT') {
    throw new ConflictError(
      'Documents can only be uploaded while the company is still a draft. Once it is with the verifier, only the verifier can review the documents.',
    );
  }
  return row;
}

/**
 * Step 1 (staff): presign an upload for a staff-onboarded DRAFT company.
 * Same pipeline as the employer path — type allowlist, size limits, content-type
 * locking and the per-company rate limit are identical.
 */
export async function presignStaffCompanyDocument(
  ctx: SignedIn,
  companyId: string,
  input: CompanyPresignInput,
): Promise<PresignedCompanyDocument> {
  const row = await loadStaffOnboardedCompany(ctx, companyId);
  return presignDocumentForCompany(ctx, row, input);
}

/**
 * Step 2 (staff): confirm an upload for a staff-onboarded DRAFT company.
 * Same pipeline as the employer path — storage check, malware scan, supersede of
 * earlier uploads of the same type, and the same audit entries.
 */
export async function confirmStaffCompanyDocument(
  ctx: SignedIn,
  companyId: string,
  documentId: string,
): Promise<CompanyView> {
  const row = await loadStaffOnboardedCompany(ctx, companyId);
  return confirmDocumentForCompany(ctx, row, documentId);
}

/** Remove (supersede) a document. Required documents can only be replaced, not removed. */
export async function removeMyCompanyDocument(
  ctx: SignedIn,
  documentId: string,
): Promise<CompanyView> {
  assertPermission(ctx.actor, 'company:register');
  const row = await requireOwnCompany(db, ctx.actor);
  const doc = await ownDocument(db, row, documentId);
  if (doc.replacedAt) return buildCompanyView(db, row);
  assertDocumentEditable(row);
  await runCommand(ctx, async ({ tx, audit }) => {
    await tx.update(docs).set({ replacedAt: new Date() }).where(eq(docs.id, doc.id));
    audit({
      action: 'company.document_remove',
      entityType: 'company',
      entityId: row.id,
      branchId: row.branchId,
      metadata: { documentId: doc.id, typeCode: doc.typeCode },
    });
  });
  return buildCompanyView(db, await requireOwnCompany(db, ctx.actor));
}

export interface DocumentLink {
  url: string;
  expiresAt: string;
}

const PRESENT_STATUSES = ['UPLOADED', 'REJECTED'] as const;

async function viewLink(doc: typeof docs.$inferSelect): Promise<DocumentLink> {
  // An infected file is never served, even if its status would otherwise allow
  // a link. (INFECTED is not a present status, so this is defence in depth.)
  if (doc.scanResult === 'infected') {
    throw new ConflictError('This upload failed a virus check');
  }
  if (!PRESENT_STATUSES.includes(doc.status as (typeof PRESENT_STATUSES)[number])) {
    throw new ConflictError('This upload was not completed');
  }
  return {
    url: await presignDownload(doc.storageKey, {
      expiresInSeconds: VIEW_LINK_SECONDS,
      disposition: 'inline',
    }),
    expiresAt: new Date(Date.now() + VIEW_LINK_SECONDS * 1000).toISOString(),
  };
}

/** Short-lived download link for the employer to view their own upload. */
export async function myCompanyDocumentLink(
  actor: Actor,
  documentId: string,
): Promise<DocumentLink> {
  assertPermission(actor, 'company:register');
  const row = await requireOwnCompany(db, actor);
  return viewLink(await ownDocument(db, row, documentId));
}

/** Staff (verifier / Branch Admin) viewing a company document — audited. */
export async function staffCompanyDocumentLink(
  ctx: SignedIn,
  companyId: string,
  documentId: string,
): Promise<DocumentLink> {
  const row = await loadCompany(db, companyId);
  assertBranchAccess(ctx.actor, row.branchId, { entityType: 'company', entityId: row.id });
  const doc = await ownDocument(db, row, documentId);
  const link = await viewLink(doc);
  await recordAudit(ctx, {
    action: 'company.document_view',
    entityType: 'company',
    entityId: row.id,
    branchId: row.branchId,
    metadata: { documentId: doc.id, typeCode: doc.typeCode },
  });
  return link;
}
