import 'server-only';
import { missingApplicantDocumentRequirements, type PresignDocumentInput } from '@jobbank/shared';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { recordAudit, runCommand } from '@/domains/shared/audit';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/domains/shared/errors';
import { enforceRateLimit } from '@/domains/shared/rate-limit';
import { assertBranchAccess, assertPermission, type Actor } from '@/domains/shared/scope';
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
import {
  a,
  applicantDocumentTypes,
  buildProfile,
  currentDocuments,
  docs,
  IDENTITY_DOCUMENT_TYPES,
  identityLocked,
  loadApplicant,
  PRESENT_DOCUMENT_STATUSES,
  pref,
  refreshProfileState,
  requireOwnApplicant,
  type ApplicantDocumentType,
  type ApplicantProfile,
  type ApplicantRow,
  type SignedIn,
} from './repository';

const MB = 1024 * 1024;
const VIEW_LINK_SECONDS = 120;

const isIdentityDocument = (typeCode: string) =>
  (IDENTITY_DOCUMENT_TYPES as readonly string[]).includes(typeCode);

/** Active applicant document types, for the upload screen. */
export async function listApplicantDocumentTypes(): Promise<ApplicantDocumentType[]> {
  return (await applicantDocumentTypes()).filter((t) => t.isActive);
}

function assertIdentityDocumentEditable(row: ApplicantRow, typeCode: string): void {
  if (isIdentityDocument(typeCode) && identityLocked(row)) {
    throw new ForbiddenError(
      'Your identity has been verified, so your CNIC images are locked. Ask your branch if they need changing.',
    );
  }
}

export interface PresignedDocument {
  documentId: string;
  upload: PresignedUpload;
}

/**
 * Step 1 of an upload: checks the file against the document type's rules and returns a
 * presigned PUT. The file goes straight from the browser to storage, never through the app.
 */
export async function presignMyDocument(
  ctx: SignedIn,
  input: PresignDocumentInput,
): Promise<PresignedDocument> {
  assertPermission(ctx.actor, 'applicant:self');
  const row = await requireOwnApplicant(db, ctx.actor);
  if (!row.branchId) {
    throw new ConflictError('Set your home location and branch before uploading documents');
  }
  const type = (await listApplicantDocumentTypes()).find((t) => t.code === input.typeCode);
  if (!type) throw new ValidationError([{ path: 'typeCode', message: 'Choose a document type' }]);
  assertIdentityDocumentEditable(row, type.code);
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
    'applicant-upload',
    row.id,
    { limit: 30, windowSeconds: 3600 },
    'Too many uploads. Please try again in an hour.',
  );

  const key = buildObjectKey({
    branchId: row.branchId,
    entity: 'applicant',
    entityId: row.id,
    contentType: input.contentType,
  });
  // Not audited: nothing is stored yet. The confirm step records the upload.
  const documentId = await runCommand(
    ctx,
    async ({ tx }) => {
      const [doc] = await tx
        .insert(docs)
        .values({
          applicantId: row.id,
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

async function ownDocument(executor: DbExecutor, row: ApplicantRow, documentId: string) {
  const [doc] = await executor
    .select()
    .from(docs)
    .where(and(eq(docs.id, documentId), eq(docs.applicantId, row.id)));
  if (!doc) throw new NotFoundError('Document', documentId);
  return doc;
}

/**
 * Step 2: the browser finished the PUT. Checks what actually landed in storage (never trust
 * the client), verifies the file's magic bytes match its declared type, scans it, and
 * makes it the current document of its type.
 *
 * Outcomes: a magic-byte mismatch rejects the row (object deleted) and the user must
 * re-upload; an 'infected' scan rejects it and quarantines the object; a 'skipped'
 * scan (no scanner configured, or the scanner failed) leaves the row PENDING_UPLOAD
 * with scanResult 'skipped' — never servable, never counted as present — and the
 * user retries confirm later, but ONLY in production (see scansEnforced): in
 * development/test 'skipped' is recorded and the upload completes, because no
 * scanner service exists yet. Only a 'clean' scan, or a 'skipped' scan outside
 * production, marks the document UPLOADED.
 */
export async function confirmMyDocument(
  ctx: SignedIn,
  documentId: string,
): Promise<ApplicantProfile> {
  assertPermission(ctx.actor, 'applicant:self');
  const row = await requireOwnApplicant(db, ctx.actor);
  const doc = await ownDocument(db, row, documentId);
  if (doc.status !== 'PENDING_UPLOAD') return buildProfile(db, row);
  assertIdentityDocumentEditable(row, doc.typeCode);

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
    // Delete the spoofed object first: a rejected row must not leave a live
    // executable in storage. If the delete itself fails, leave the row
    // PENDING_UPLOAD (propagate the error) so the user can retry.
    await deleteObject(doc.storageKey);
    await runCommand(ctx, async ({ tx, audit }) => {
      await tx
        .update(docs)
        .set({
          status: 'REJECTED',
          scanResult: 'skipped',
          reviewNote: 'The file contents do not match its declared type',
        })
        .where(eq(docs.id, doc.id));
      audit({
        action: 'applicant.document_type_mismatch',
        entityType: 'applicant',
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
    // (viewLink refuses scanResult 'infected'), so a failed delete is not fatal.
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
        action: 'applicant.document_scan_pending',
        entityType: 'applicant',
        entityId: row.id,
        branchId: row.branchId,
        metadata: { documentId: doc.id, typeCode: doc.typeCode },
      });
    });
    throw new ConflictError(
      'This file has not been virus-scanned yet. Please try again in a few minutes.',
    );
  }
  const type = (await applicantDocumentTypes()).find((t) => t.code === doc.typeCode);

  await runCommand(ctx, async (cmd) => {
    const { tx, audit } = cmd;
    const fresh = await loadApplicant(tx, row.id, { forUpdate: true });
    if (scan === 'infected') {
      await tx
        .update(docs)
        .set({ status: 'REJECTED', scanResult: scan, reviewNote: 'The file failed a virus check' })
        .where(eq(docs.id, doc.id));
      audit({
        action: 'applicant.document_infected',
        entityType: 'applicant',
        entityId: row.id,
        branchId: fresh.branchId,
        metadata: { documentId: doc.id, typeCode: doc.typeCode },
      });
      return;
    }
    const now = new Date();
    const replaced = type?.meta.multiple
      ? []
      : await tx
          .update(docs)
          .set({ replacedAt: now })
          .where(
            and(
              eq(docs.applicantId, row.id),
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
    // New CNIC images after a failed check go back to staff for a new check.
    if (isIdentityDocument(doc.typeCode) && fresh.identityStatus === 'REJECTED') {
      await tx.update(a).set({ identityStatus: 'UNVERIFIED' }).where(eq(a.id, row.id));
    }
    audit({
      action: 'applicant.document_upload',
      entityType: 'applicant',
      entityId: row.id,
      branchId: fresh.branchId,
      metadata: {
        documentId: doc.id,
        typeCode: doc.typeCode,
        sizeBytes: doc.sizeBytes,
        scan,
        replaced: replaced.map((r) => r.id),
      },
    });
    await refreshProfileState(cmd, row.id);
  });
  if (scan === 'infected') {
    throw new ConflictError('This file failed a virus check and was not saved.');
  }
  return buildProfile(db, await requireOwnApplicant(db, ctx.actor));
}

/** Optional documents can be removed; required ones can only be replaced. Rows are kept. */
export async function removeMyDocument(
  ctx: SignedIn,
  documentId: string,
): Promise<ApplicantProfile> {
  assertPermission(ctx.actor, 'applicant:self');
  const row = await requireOwnApplicant(db, ctx.actor);
  const doc = await ownDocument(db, row, documentId);
  if (doc.replacedAt) return buildProfile(db, row);
  assertIdentityDocumentEditable(row, doc.typeCode);
  const [types, [preferences], present] = await Promise.all([
    applicantDocumentTypes(),
    db.select({ categories: pref.categoryCodes }).from(pref).where(eq(pref.applicantId, row.id)),
    currentDocuments(db, row.id),
  ]);
  const activeRequirements = types
    .filter((type) => type.isActive)
    .map((type) => ({ code: type.code, ...type.meta }));
  const categories = preferences?.categories ?? [];
  const missingBefore = missingApplicantDocumentRequirements(
    activeRequirements,
    categories,
    present.map((document) => document.typeCode),
  );
  const missingAfter = missingApplicantDocumentRequirements(
    activeRequirements,
    categories,
    present.filter((document) => document.id !== doc.id).map((document) => document.typeCode),
  );
  if (missingAfter > missingBefore) {
    throw new ConflictError(
      'This document is required for your selected job categories and cannot be removed',
    );
  }
  await runCommand(ctx, async (cmd) => {
    await cmd.tx.update(docs).set({ replacedAt: new Date() }).where(eq(docs.id, doc.id));
    cmd.audit({
      action: 'applicant.document_remove',
      entityType: 'applicant',
      entityId: row.id,
      branchId: row.branchId,
      metadata: { documentId: doc.id, typeCode: doc.typeCode },
    });
    await refreshProfileState(cmd, row.id);
  });
  return buildProfile(db, await requireOwnApplicant(db, ctx.actor));
}

export interface DocumentLink {
  url: string;
  expiresAt: string;
}

async function viewLink(doc: typeof docs.$inferSelect): Promise<DocumentLink> {
  // An infected file is never served, even if its status would otherwise allow
  // a link (the applicant REJECTED status covers review rejections of clean files).
  if (doc.scanResult === 'infected') {
    throw new ConflictError('This upload failed a virus check');
  }
  if (!PRESENT_DOCUMENT_STATUSES.includes(doc.status)) {
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

/** Short-lived link for the applicant to view their own upload. */
export async function myDocumentLink(actor: Actor, documentId: string): Promise<DocumentLink> {
  assertPermission(actor, 'applicant:self');
  const row = await requireOwnApplicant(db, actor);
  return viewLink(await ownDocument(db, row, documentId));
}

/** Staff viewing an applicant's document: scoped to their branch, and always audited. */
export async function staffDocumentLink(
  ctx: SignedIn,
  applicantId: string,
  documentId: string,
): Promise<DocumentLink> {
  assertPermission(ctx.actor, 'applicant:read');
  const row = await loadApplicant(db, applicantId);
  assertBranchAccess(ctx.actor, row.branchId, { entityType: 'applicant', entityId: row.id });
  const doc = await ownDocument(db, row, documentId);
  const link = await viewLink(doc);
  await recordAudit(ctx, {
    action: 'applicant.document_view',
    entityType: 'applicant',
    entityId: row.id,
    branchId: row.branchId,
    metadata: { documentId: doc.id, typeCode: doc.typeCode },
  });
  return link;
}
