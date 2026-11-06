import 'server-only';
import { schema } from '@jobbank/db';
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { recordAudit, type RequestContext } from '@/domains/shared/audit';
import { db } from '@/lib/db';
import { deleteObject } from '@/lib/s3/storage';

/**
 * Stale PENDING_UPLOAD sweep.
 *
 * A document row is created at presign time and leaves PENDING_UPLOAD when the
 * browser's PUT lands and confirm runs. Presigned PUTs expire in 5 minutes
 * and the browser uploads immediately after presign, so a row still pending
 * after a day was never completed — the user just re-uploads (presign creates
 * a fresh row). Until this sweep runs, the abandoned rows sit in the table
 * forever and any object that did land in storage is orphaned: nothing ever
 * serves it (currentDocuments only counts UPLOADED rows) and nothing deletes
 * it.
 *
 * The sweep retires stale rows (replacedAt, the repo's "removed" marker — the
 * row stays for forensics) and deletes their storage objects best-effort. It
 * never touches rows a confirm could still complete: only PENDING_UPLOAD
 * rows older than STALE_UPLOAD_AFTER_HOURS, with no replacement.
 */
export const STALE_UPLOAD_AFTER_HOURS = 24;
/** Bound the work per run so a big backlog can't hold the request open. */
export const STALE_UPLOAD_BATCH_SIZE = 500;

export interface StaleUploadSweepCounts {
  examined: number;
  expired: number;
  objectsDeleted: number;
}

export interface StaleUploadSweepResult {
  cutoff: string;
  applicants: StaleUploadSweepCounts;
  companies: StaleUploadSweepCounts;
}

async function sweepTable(
  table: typeof schema.applicantDocuments | typeof schema.companyDocuments,
  cutoff: Date,
): Promise<StaleUploadSweepCounts> {
  const stale = await db
    .select({ id: table.id, storageKey: table.storageKey })
    .from(table)
    .where(
      and(
        eq(table.status, 'PENDING_UPLOAD'),
        isNull(table.replacedAt),
        lt(table.createdAt, cutoff),
      ),
    )
    .limit(STALE_UPLOAD_BATCH_SIZE);
  let objectsDeleted = 0;
  for (const row of stale) {
    // Best-effort: the PUT may never have happened, and S3 DeleteObject is
    // idempotent — a missing object is not an error. A failed delete must not
    // block retiring the row; the object is unservable either way.
    await deleteObject(row.storageKey)
      .then(() => {
        objectsDeleted += 1;
      })
      .catch(() => undefined);
  }
  if (stale.length > 0) {
    await db
      .update(table)
      .set({ replacedAt: new Date(), reviewNote: 'Expired: upload never completed' })
      .where(
        inArray(
          table.id,
          stale.map((r) => r.id),
        ),
      );
  }
  return { examined: stale.length, expired: stale.length, objectsDeleted };
}

/** Expire stale PENDING_UPLOAD rows (applicants + companies) and their objects. */
export async function sweepStaleUploads(ctx: RequestContext): Promise<StaleUploadSweepResult> {
  const cutoff = new Date(Date.now() - STALE_UPLOAD_AFTER_HOURS * 60 * 60 * 1000);
  const [applicants, companies] = await Promise.all([
    sweepTable(schema.applicantDocuments, cutoff),
    sweepTable(schema.companyDocuments, cutoff),
  ]);
  await recordAudit(ctx, {
    action: 'maintenance.stale_uploads_swept',
    entityType: 'system',
    entityId: null,
    metadata: {
      cutoff: cutoff.toISOString(),
      applicants,
      companies,
    },
  });
  return { cutoff: cutoff.toISOString(), applicants, companies };
}
