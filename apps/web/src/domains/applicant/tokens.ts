import 'server-only';
import { schema } from '@jobbank/db';
import {
  karachiDay,
  tokenCodeFor,
  type ApplicantTokenView,
  type IssueApplicantTokenInput,
} from '@jobbank/shared';
import { and, desc, eq, max } from 'drizzle-orm';
import { getBranchContact } from '@/domains/branch';
import { runCommand } from '@/domains/shared/audit';
import { ConflictError, ValidationError, isUniqueViolation } from '@/domains/shared/errors';
import { assertBranchAccess, assertPermission, isSuperAdmin } from '@/domains/shared/scope';
import { db } from '@/lib/db';
import { cnicTakenError } from './profile';
import { cnicOwner, type SignedIn } from './repository';

const tokens = schema.branchApplicantTokens;

/**
 * First-counter token (2026-11-07 reversal): the first counter collects a
 * CNIC + name + phone number and issues a numbered token for the day. The
 * number is a daily sequence per branch, starting at 1. The full
 * registration happens at a later step and links back through `applicantId`
 * on the token row.
 */

export type { ApplicantTokenView };

function toView(
  row: typeof tokens.$inferSelect,
  branch: { id: string; code: string; name: string },
): ApplicantTokenView {
  return {
    id: row.id,
    tokenNumber: row.tokenNumber,
    tokenCode: tokenCodeFor(branch.code, row.tokenNumber),
    branchId: row.branchId,
    branchCode: branch.code,
    branchName: branch.name,
    cnic: row.cnic,
    applicantName: row.applicantName,
    phone: row.phone,
    issuedAt: row.issuedAt.toISOString(),
    status: row.status,
    applicantId: row.applicantId,
  };
}

/** Issue a token for a person at the branch (Staff / Branch Admin / Super Admin). */
export async function issueApplicantToken(
  ctx: SignedIn,
  input: IssueApplicantTokenInput,
): Promise<ApplicantTokenView> {
  assertPermission(ctx.actor, 'applicant:manage');
  if (!isSuperAdmin(ctx.actor)) assertBranchAccess(ctx.actor, input.branchId);

  const branch = await getBranchContact(input.branchId);
  if (!branch) {
    throw new ValidationError([{ path: 'branchId', message: 'Choose a branch' }]);
  }
  if (!branch.isActive) {
    throw new ValidationError([{ path: 'branchId', message: 'Choose an active branch' }]);
  }

  // A CNIC that already has a full profile never gets a token: the person
  // recovers their account at the branch that holds it instead.
  const owner = await cnicOwner(db, input.cnic);
  if (owner) throw await cnicTakenError(db, owner);

  const today = karachiDay();
  // Same person, same branch, same day: hand back the token already issued
  // instead of a duplicate (e.g. the slip was lost, or the counter double-clicked).
  const [existing] = await db
    .select()
    .from(tokens)
    .where(
      and(
        eq(tokens.branchId, input.branchId),
        eq(tokens.registrationDay, today),
        eq(tokens.cnic, input.cnic),
        eq(tokens.status, 'ISSUED'),
      ),
    )
    .orderBy(desc(tokens.issuedAt))
    .limit(1);
  if (existing) return toView(existing, branch);

  // Two counters can issue at the same moment: the unique index on
  // (branch, day, number) is the guard — on a collision, retry with the next number.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await runCommand(ctx, async ({ tx, audit }) => {
        const recheckedOwner = await cnicOwner(tx, input.cnic);
        if (recheckedOwner) throw await cnicTakenError(tx, recheckedOwner);

        const [highest] = await tx
          .select({ value: max(tokens.tokenNumber) })
          .from(tokens)
          .where(and(eq(tokens.branchId, input.branchId), eq(tokens.registrationDay, today)));
        const tokenNumber = (highest?.value ?? 0) + 1;

        const [created] = await tx
          .insert(tokens)
          .values({
            branchId: input.branchId,
            registrationDay: today,
            tokenNumber,
            cnic: input.cnic,
            applicantName: input.applicantName,
            phone: input.phone,
            issuedBy: ctx.actor.userId,
          })
          .returning();
        if (!created) throw new Error('Token could not be saved.');
        audit({
          action: 'applicant.token_issued',
          entityType: 'applicant_token',
          entityId: created.id,
          branchId: input.branchId,
          after: {
            tokenNumber,
            tokenCode: tokenCodeFor(branch.code, tokenNumber),
            cnic: input.cnic,
            applicantName: input.applicantName,
            phone: input.phone,
          },
          metadata: { issuedBy: ctx.actor.userId },
        });
        return created;
      });
      return toView(row, branch);
    } catch (error) {
      if (
        isUniqueViolation(error, 'branch_applicant_tokens_branch_day_number_unique') &&
        attempt < 4
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new ConflictError('Could not issue a token. Please try again.');
}
