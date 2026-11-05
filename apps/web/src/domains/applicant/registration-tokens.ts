import 'server-only';
import { schema } from '@jobbank/db';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { hashAccountToken } from '@/domains/auth';
import { runCommand, type RequestContext } from '@/domains/shared/audit';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '@/domains/shared/errors';
import { assertPermission, assertRole, type Actor } from '@/domains/shared/scope';
import { db, type DbExecutor } from '@/lib/db';

const normalizeToken = (token: string) => token.trim().toUpperCase();

export interface RegistrationTokenApplicant {
  id: string;
  fullName: string;
  cnic: string;
  branchName: string;
  status: string;
}

function assertCanVerify(actor: Actor) {
  assertRole(actor, 'STAFF', 'BRANCH_ADMIN');
  assertPermission(actor, 'applicant:read');
}

function assertBranch(actor: Actor, branchId: string | null) {
  if (!branchId) throw new NotFoundError('Registration token');
  if (!actor.roles.includes('SUPER_ADMIN') && !actor.branchIds.includes(branchId)) {
    throw new ForbiddenError('This registration token belongs to another branch.');
  }
}

function assertTokenUsable(token: { usedAt: Date | null; expiresAt: Date }) {
  if (token.usedAt) throw new ConflictError('This registration token has already been used.');
  if (token.expiresAt.getTime() <= Date.now()) {
    throw new BadRequestError('This registration token has expired. Ask staff to issue a new one.');
  }
}

async function applicantForToken(
  executor: DbExecutor,
  userId: string,
): Promise<RegistrationTokenApplicant> {
  const [applicant] = await executor
    .select({
      id: schema.applicants.id,
      fullName: schema.applicants.fullName,
      cnic: schema.applicants.cnic,
      branchId: schema.applicants.branchId,
      branchName: schema.branches.name,
      status: schema.applicants.status,
    })
    .from(schema.applicants)
    .innerJoin(schema.branches, eq(schema.branches.id, schema.applicants.branchId))
    .where(eq(schema.applicants.userId, userId));
  if (!applicant) throw new NotFoundError('Applicant');
  return {
    id: applicant.id,
    fullName: applicant.fullName,
    cnic: applicant.cnic,
    branchName: applicant.branchName,
    status: applicant.status,
  };
}

export async function lookupRegistrationToken(
  actor: Actor,
  rawToken: string,
): Promise<RegistrationTokenApplicant> {
  assertCanVerify(actor);
  const token = normalizeToken(rawToken);
  if (!token) throw new BadRequestError('Enter or scan a registration token.');

  const [row] = await db
    .select({
      userId: schema.accountTokens.userId,
      branchId: schema.accountTokens.branchId,
      usedAt: schema.accountTokens.usedAt,
      expiresAt: schema.accountTokens.expiresAt,
    })
    .from(schema.accountTokens)
    .where(
      and(
        eq(schema.accountTokens.tokenHash, hashAccountToken(token)),
        eq(schema.accountTokens.purpose, 'BRANCH_REGISTRATION'),
      ),
    );
  if (!row) throw new NotFoundError('Registration token');
  assertBranch(actor, row.branchId);
  assertTokenUsable(row);
  return applicantForToken(db, row.userId);
}

export async function confirmRegistrationToken(
  ctx: RequestContext & { actor: Actor },
  rawToken: string,
): Promise<RegistrationTokenApplicant> {
  assertCanVerify(ctx.actor);
  const token = normalizeToken(rawToken);
  if (!token) throw new BadRequestError('Enter or scan a registration token.');

  let applicant: RegistrationTokenApplicant | undefined;
  await runCommand(ctx, async ({ tx, audit }) => {
    const [row] = await tx
      .select({
        id: schema.accountTokens.id,
        userId: schema.accountTokens.userId,
        branchId: schema.accountTokens.branchId,
        usedAt: schema.accountTokens.usedAt,
        expiresAt: schema.accountTokens.expiresAt,
      })
      .from(schema.accountTokens)
      .where(
        and(
          eq(schema.accountTokens.tokenHash, hashAccountToken(token)),
          eq(schema.accountTokens.purpose, 'BRANCH_REGISTRATION'),
        ),
      )
      .for('update');
    if (!row) throw new NotFoundError('Registration token');
    assertBranch(ctx.actor, row.branchId);
    assertTokenUsable(row);
    applicant = await applicantForToken(tx, row.userId);

    const [consumed] = await tx
      .update(schema.accountTokens)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(schema.accountTokens.id, row.id),
          isNull(schema.accountTokens.usedAt),
          gt(schema.accountTokens.expiresAt, sql`now()`),
        ),
      )
      .returning({ id: schema.accountTokens.id });
    if (!consumed) {
      throw new ConflictError('This registration token has already been used or has expired.');
    }

    audit({
      action: 'applicant.registration_token_confirmed',
      entityType: 'applicant',
      entityId: applicant.id,
      branchId: row.branchId,
      after: { token, status: applicant.status },
    });
  });
  if (!applicant)
    throw new Error('Registration token confirmation completed without an applicant.');
  return applicant;
}
