import 'server-only';
import { schema } from '@jobbank/db';
import {
  COMPANY_STATUSES,
  PUBLIC_COMPANY_STATUSES,
  ROLE_LABELS,
  ROLE_PRIORITY,
  type CompanyStatus,
  type RegisterCompanyInput,
  type Role,
  type StaffOnboardCompanyInput,
  type UpdateCompanyInput,
  type VerificationState,
} from '@jobbank/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  max,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';
import { getBranchContact } from '@/domains/branch';
import { assertActiveMasterData, masterDataLabels } from '@/domains/settings';
import { runCommand } from '@/domains/shared/audit';
import {
  ConflictError,
  isUniqueViolation,
  NotFoundError,
  ValidationError,
} from '@/domains/shared/errors';
import { paginationMeta, type ListQuery } from '@/domains/shared/pagination';
import {
  assertBranchAccess,
  assertPermission,
  assertRole,
  branchScope,
  hasPermission,
  isSuperAdmin,
  type Actor,
} from '@/domains/shared/scope';
import { db, type DbExecutor } from '@/lib/db';
import { companyMachine, READY } from './machine';
import {
  buildCompanyView,
  c,
  contacts,
  loadCompany,
  openVerification,
  recordTransition,
  ver,
  verificationDueOn,
  type CompanyView,
  type SignedIn,
} from './repository';

// ─── Company listing ───────────────────────────────────────────────────

export const COMPANY_SORTABLE = ['legalName', 'createdAt', 'status'] as const;

const ACTIVE_NTN_CONSTRAINT = 'companies_ntn_active_uq';

const ntnTaken = () =>
  new ConflictError('A company with this NTN is already registered with Saylani Job Bank.', {
    reason: 'NTN_TAKEN',
  });

/**
 * Owner decision 4 (packages/db/src/schema/companies.ts): one LIVE company per NTN.
 * A second DRAFT — or a re-registration after a REJECTED one — is allowed by design:
 * drafts don't count (no squatting) and a rejected company may be re-registered by
 * its real owner. That is deliberately looser than the CNIC rule (one applicant row
 * per CNIC ever, `applicants_cnic_unique`): a mistyped NTN on a draft must not block
 * a later correct registration, while a second live company must never exist.
 *
 * What the rule does require is that a live duplicate fails with a clean 409
 * NTN_TAKEN — never a raw 500, and never a silent second DRAFT created next to a
 * live company by a concurrent request. So every staff write below re-checks inside
 * its transaction AND maps the partial-index violation to 409: the check-then-act
 * read outside the transaction is only an early friendly error, never the guard.
 */
async function assertNtnFree(executor: DbExecutor, ntn: string, exceptId?: string) {
  const [other] = await executor
    .select({ id: c.id })
    .from(c)
    .where(
      and(
        eq(c.ntn, ntn),
        notInArray(c.status, ['DRAFT', 'REJECTED']),
        exceptId ? ne(c.id, exceptId) : undefined,
      ),
    );
  if (other) throw ntnTaken();
}

export const companyFilters = {
  status: z.enum(COMPANY_STATUSES).optional(),
  branchId: z.uuid().optional(),
};

export interface CompanyListItem {
  id: string;
  legalName: string;
  tradeName: string | null;
  ntn: string;
  status: CompanyStatus;
  branchName: string | null;
  industryLabel: string | null;
  createdAt: string;
  verifiedAt: string | null;
}

/**
 * Branch Admin: VERIFIED + SUSPENDED in their branch(es).
 * Super Admin: all companies, any status.
 * Verifiers have their own queue (listQueue) and do not use this endpoint.
 */
export async function listCompanies(
  actor: Actor,
  query: ListQuery<
    (typeof COMPANY_SORTABLE)[number],
    { status?: CompanyStatus; branchId?: string }
  >,
) {
  // Both company:read (Branch Admin for verified) and company:manage (Super Admin) can list.
  // Staff who onboard companies see every status, but only the companies they onboarded.
  const canManage = hasPermission(actor, 'company:manage');
  const canOnboard = hasPermission(actor, 'company:onboard');
  if (!canManage && !canOnboard) assertPermission(actor, 'company:read');
  const f = query.filters;

  const visibleStatuses =
    canManage || canOnboard
      ? f.status
        ? [f.status]
        : [...COMPANY_STATUSES]
      : f.status
        ? (PUBLIC_COMPANY_STATUSES as readonly string[]).includes(f.status)
          ? [f.status]
          : []
        : [...PUBLIC_COMPANY_STATUSES];
  if (visibleStatuses.length === 0) return { items: [], pagination: paginationMeta(query, 0) };

  const conditions: (SQL | undefined)[] = [
    branchScope(actor, c.branchId),
    inArray(c.status, visibleStatuses),
    f.branchId ? eq(c.branchId, f.branchId) : undefined,
    // Staff see the companies they onboarded; Branch Admin / Super Admin see the branch.
    !canManage && canOnboard ? eq(c.createdBy, actor.userId) : undefined,
  ];
  if (query.q) {
    conditions.push(
      or(
        ilike(c.legalName, `%${query.q}%`),
        ilike(c.tradeName, `%${query.q}%`),
        sql`${c.ntn} like ${`${query.q}%`}`,
      ),
    );
  }
  const where = and(...conditions);

  const sortColumn = {
    legalName: c.legalName,
    createdAt: c.createdAt,
    status: c.status,
  }[query.sort.field];

  const base = () =>
    db
      .select({
        id: c.id,
        legalName: c.legalName,
        tradeName: c.tradeName,
        ntn: c.ntn,
        status: c.status,
        branchName: schema.branches.name,
        industryCode: c.industryCode,
        createdAt: c.createdAt,
        verifiedAt: c.verifiedAt,
      })
      .from(c)
      .leftJoin(schema.branches, eq(schema.branches.id, c.branchId));

  const [rows, [total], allLabels] = await Promise.all([
    base()
      .where(where)
      .orderBy(query.sort.direction === 'asc' ? asc(sortColumn) : desc(sortColumn), asc(c.id))
      .limit(query.limit)
      .offset(query.offset),
    db
      .select({ value: count() })
      .from(c)
      .leftJoin(schema.branches, eq(schema.branches.id, c.branchId))
      .where(where),
    masterDataLabels(['INDUSTRY']),
  ]);

  const industryLabels = allLabels['INDUSTRY'] ?? {};

  const items: CompanyListItem[] = rows.map((row) => ({
    id: row.id,
    legalName: row.legalName,
    tradeName: row.tradeName,
    ntn: row.ntn,
    status: row.status,
    branchName: row.branchName,
    industryLabel: industryLabels[row.industryCode] ?? null,
    createdAt: row.createdAt.toISOString(),
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  }));

  return { items, pagination: paginationMeta(query, total!.value) };
}

/** Detailed company view for staff. */
export async function getCompanyDetail(actor: Actor, companyId: string): Promise<CompanyView> {
  const canManage = hasPermission(actor, 'company:manage');
  if (!canManage) assertPermission(actor, 'company:read');
  const row = await loadCompany(db, companyId);
  assertBranchAccess(actor, row.branchId, { entityType: 'company', entityId: row.id });
  // if (!canManage && !(PUBLIC_COMPANY_STATUSES as readonly string[]).includes(row.status)) {
  //   throw new ForbiddenError('This company is not yet verified');
  // }
  return buildCompanyView(db, row);
}

// ─── Suspend / reinstate ───────────────────────────────────────────────

export async function suspendCompany(
  ctx: SignedIn,
  companyId: string,
  input: { reason: string },
): Promise<CompanyView> {
  assertPermission(ctx.actor, 'company:suspend');
  await runCommand(ctx, async ({ tx, audit, emit }) => {
    const row = await loadCompany(tx, companyId, { forUpdate: true });
    assertBranchAccess(ctx.actor, row.branchId, { entityType: 'company', entityId: row.id });
    const to = companyMachine.transition(row.status, 'SUSPEND', READY, ctx.actor.roles);
    await tx.update(c).set({ status: to }).where(eq(c.id, row.id));
    // The latest verification round stays VERIFIED — the suspension is at the company level.
    audit({
      action: 'company.suspend',
      entityType: 'company',
      entityId: row.id,
      branchId: row.branchId,
      before: { status: row.status },
      after: { status: to },
      metadata: { reason: input.reason },
    });
    emit('company.suspended', { companyId: row.id, branchId: row.branchId! });
  });
  return getCompanyDetail(ctx.actor, companyId);
}

export async function reinstateCompany(
  ctx: SignedIn,
  companyId: string,
  input: { reason: string },
): Promise<CompanyView> {
  assertPermission(ctx.actor, 'company:suspend');
  await runCommand(ctx, async ({ tx, audit, emit }) => {
    const row = await loadCompany(tx, companyId, { forUpdate: true });
    assertBranchAccess(ctx.actor, row.branchId, { entityType: 'company', entityId: row.id });
    const to = companyMachine.transition(row.status, 'REINSTATE', READY, ctx.actor.roles);
    await tx.update(c).set({ status: to }).where(eq(c.id, row.id));
    audit({
      action: 'company.reinstate',
      entityType: 'company',
      entityId: row.id,
      branchId: row.branchId,
      before: { status: row.status },
      after: { status: to },
      metadata: { reason: input.reason },
    });
    // Reinstate emits company.verified — the company is visible again.
    emit('company.verified', { companyId: row.id, branchId: row.branchId! });
  });
  return getCompanyDetail(ctx.actor, companyId);
}

// ─── Super Admin ───────────────────────────────────────────────────────

/** Super Admin assigns or reassigns a verifier to an open round. */
export async function assignVerifier(
  ctx: SignedIn,
  companyId: string,
  input: { verifierId: string; reason: string },
): Promise<CompanyView> {
  assertPermission(ctx.actor, 'company:manage');
  await runCommand(ctx, async ({ tx, audit }) => {
    const row = await loadCompany(tx, companyId, { forUpdate: true });
    const to = companyMachine.transition(row.status, 'ASSIGN', READY, ctx.actor.roles);
    const round = await openVerification(tx, row.id, { forUpdate: true });
    if (!round) throw new NotFoundError('Open verification for company', companyId);
    const prevVerifier = round.assignedVerifierId;
    await tx
      .update(ver)
      .set({ state: to as VerificationState, assignedVerifierId: input.verifierId })
      .where(eq(ver.id, round.id));
    if (row.status !== to) {
      await tx.update(c).set({ status: to }).where(eq(c.id, row.id));
    }
    await recordTransition(tx, {
      verificationId: round.id,
      companyId: row.id,
      event: 'ASSIGN',
      fromStatus: row.status,
      toStatus: to,
      actorId: ctx.actor.userId,
      note: input.reason,
      metadata: { verifierId: input.verifierId, previousVerifierId: prevVerifier },
    });
    audit({
      action: 'company.assign_verifier',
      entityType: 'company',
      entityId: row.id,
      branchId: row.branchId,
      before: { assignedVerifierId: prevVerifier, status: row.status },
      after: { assignedVerifierId: input.verifierId, status: to },
      metadata: { reason: input.reason },
    });
  });
  return getCompanyDetail(ctx.actor, companyId);
}

/** Super Admin changes the company's branch without re-verification. */
export async function transferCompany(
  ctx: SignedIn,
  companyId: string,
  input: { branchId: string; reason: string },
): Promise<CompanyView> {
  assertPermission(ctx.actor, 'company:manage');
  await runCommand(ctx, async ({ tx, audit }) => {
    const row = await loadCompany(tx, companyId, { forUpdate: true });
    if (row.branchId === input.branchId) return;
    const branch = await getBranchContact(input.branchId, tx);
    if (!branch?.isActive) {
      throw new ValidationError([{ path: 'branchId', message: 'Choose an active branch' }]);
    }
    // Move the company and any open verification round.
    await tx.update(c).set({ branchId: input.branchId }).where(eq(c.id, row.id));
    const round = await openVerification(tx, row.id, { forUpdate: true });
    if (round) {
      await tx.update(ver).set({ branchId: input.branchId }).where(eq(ver.id, round.id));
    }
    audit({
      action: 'company.transfer',
      entityType: 'company',
      entityId: row.id,
      branchId: input.branchId,
      before: { branchId: row.branchId },
      after: { branchId: input.branchId },
      metadata: { reason: input.reason },
    });
  });
  return getCompanyDetail(ctx.actor, companyId);
}

/** Branch Admin or Super Admin registers a company on behalf of an employer. */
export async function staffRegisterCompany(
  ctx: SignedIn,
  input: RegisterCompanyInput & { branchId: string },
): Promise<CompanyView> {
  assertPermission(ctx.actor, 'company:manage');
  if (!isSuperAdmin(ctx.actor)) assertBranchAccess(ctx.actor, input.branchId);

  const { branchId, ...companyInput } = input;
  const [existing] = await db
    .select({ id: c.id })
    .from(c)
    .where(and(eq(c.ntn, companyInput.ntn), sql`${c.status} not in ('DRAFT', 'REJECTED')`));
  if (existing) throw ntnTaken();

  let createdId: string | null = null;
  try {
    await runCommand(ctx, async ({ tx, audit }) => {
      // Re-check inside the transaction: a live company with this NTN may have
      // appeared after the read above (see assertNtnFree).
      await assertNtnFree(tx, companyInput.ntn);
      const [row] = await tx
        .insert(c)
        .values({ ...companyInput, branchId, createdBy: ctx.actor.userId })
        .returning();
      createdId = row!.id;
      audit({
        action: 'company.register',
        entityType: 'company',
        entityId: row!.id,
        branchId,
        after: { ...companyInput, branchId },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, ACTIVE_NTN_CONSTRAINT)) throw ntnTaken();
    throw error;
  }

  const [row] = await db.select().from(c).where(eq(c.id, createdId!));
  return buildCompanyView(db, row!);
}

// ─── Field-visit onboarding ────────────────────────────────────────────

export interface CompanyOnboardingNotes {
  headOfficeAddress: string | null;
  otherSites: string | null;
  workforceRoles: string | null;
  workforceType: string | null;
  workforceShifts: string | null;
  workforceOpenings: string | null;
  yearsInBusiness: string | null;
  previousHiring: string | null;
  certifications: string | null;
  additionalNotes: string | null;
}

export interface CompanyOnboarding {
  onboardedBy: { name: string | null; roleLabel: string | null } | null;
  visitDate: string | null;
  /** True when the company agreed to work with Saylani. */
  agreed: boolean;
  notes: CompanyOnboardingNotes;
}

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/**
 * The outreach record for a company registered by staff after a field visit, read
 * from the `company_onboarding` table (migration 0026). Returns null for companies
 * the employer registered themselves — those carry no visit or agreement. The
 * `company.register` audit entry is evidence only and is no longer read back, so
 * audit retention/purge and PII redaction can no longer destroy this record.
 */
export async function getCompanyOnboarding(
  actor: Actor,
  companyId: string,
): Promise<CompanyOnboarding | null> {
  assertPermission(actor, 'company:read');
  const row = await loadCompany(db, companyId);
  assertBranchAccess(actor, row.branchId, { entityType: 'company', entityId: row.id });
  const [onboarding] = await db
    .select()
    .from(schema.companyOnboarding)
    .where(eq(schema.companyOnboarding.companyId, row.id))
    .limit(1);
  if (!onboarding || !onboarding.agreed) return null;
  // Name + current role of the staff member who onboarded the company (shown on
  // the paper form). Roles can change after the visit, so this is read live.
  const [[user], roles] = await Promise.all([
    onboarding.onboardedBy
      ? db
          .select({ name: schema.users.name })
          .from(schema.users)
          .where(eq(schema.users.id, onboarding.onboardedBy))
          .limit(1)
      : Promise.resolve([]),
    onboarding.onboardedBy
      ? db
          .select({ roleCode: schema.userRoles.roleCode })
          .from(schema.userRoles)
          .where(eq(schema.userRoles.userId, onboarding.onboardedBy))
      : Promise.resolve([]),
  ]);
  const role = ROLE_PRIORITY.find((r: Role) => roles.some((a) => a.roleCode === r));
  return {
    onboardedBy: onboarding.onboardedBy
      ? { name: user?.name ?? null, roleLabel: role ? ROLE_LABELS[role] : null }
      : null,
    visitDate: asText(onboarding.visitDate),
    agreed: true,
    notes: {
      headOfficeAddress: asText(onboarding.headOfficeAddress),
      otherSites: asText(onboarding.otherSites),
      workforceRoles: asText(onboarding.workforceRoles),
      workforceType: asText(onboarding.workforceType),
      workforceShifts: asText(onboarding.workforceShifts),
      workforceOpenings: asText(onboarding.workforceOpenings),
      yearsInBusiness: asText(onboarding.yearsInBusiness),
      previousHiring: asText(onboarding.previousHiring),
      certifications: asText(onboarding.certifications),
      additionalNotes: asText(onboarding.additionalNotes),
    },
  };
}

/**
 * Staff, Branch Admin, Super Admin or Verifier registers a company they visited and onboarded.
 * Creates a DRAFT company plus its main contact; the outreach record (who visited,
 * when, the company's agreement, and the extra notes) is stored in the
 * `company_onboarding` table, in the same transaction as the company row.
 */
export async function staffOnboardCompany(
  ctx: SignedIn,
  input: StaffOnboardCompanyInput,
): Promise<CompanyView & { onboarding: CompanyOnboarding }> {
  assertPermission(ctx.actor, 'company:onboard');
  if (!isSuperAdmin(ctx.actor)) assertBranchAccess(ctx.actor, input.branchId);

  const {
    branchId,
    contactName,
    contactDesignation,
    contactPhone,
    contactEmail,
    visitDate,
    agreed,
    // Notes stay out of the company row; they go to `company_onboarding` below.
    headOfficeAddress,
    otherSites,
    workforceRoles,
    workforceType,
    workforceShifts,
    workforceOpenings,
    yearsInBusiness,
    previousHiring,
    certifications,
    additionalNotes,
    ...companyInput
  } = input;

  await assertActiveMasterData(db, 'INDUSTRY', [companyInput.industryCode], () => 'industryCode');
  const [existing] = await db
    .select({ id: c.id })
    .from(c)
    .where(and(eq(c.ntn, companyInput.ntn), sql`${c.status} not in ('DRAFT', 'REJECTED')`));
  if (existing) throw ntnTaken();

  let createdId: string | null = null;
  try {
    await runCommand(ctx, async ({ tx, audit }) => {
      // Re-check inside the transaction: a live company with this NTN may have
      // appeared after the read above (see assertNtnFree).
      await assertNtnFree(tx, companyInput.ntn);
      const [row] = await tx
        .insert(c)
        .values({ ...companyInput, branchId, createdBy: ctx.actor.userId })
        .returning();
      createdId = row!.id;
      await tx.insert(contacts).values({
        companyId: row!.id,
        name: contactName,
        designation: contactDesignation,
        phone: contactPhone,
        email: contactEmail,
        isPrimary: true,
        sortOrder: 0,
      });
      await tx.insert(schema.companyOnboarding).values({
        companyId: row!.id,
        onboardedBy: ctx.actor.userId,
        visitDate,
        agreed,
        headOfficeAddress,
        otherSites,
        workforceRoles,
        workforceType,
        workforceShifts,
        workforceOpenings,
        yearsInBusiness,
        previousHiring,
        certifications,
        additionalNotes,
      });
      audit({
        action: 'company.register',
        entityType: 'company',
        entityId: row!.id,
        branchId,
        // Evidence only: the outreach record lives in `company_onboarding`
        // (migration 0026). Keep PII — contact details, notes, NTN — out of the
        // audit trail; it is redacted there anyway (see lib/privacy/redact.ts).
        after: { legalName: companyInput.legalName, branchId },
        metadata: { onboardedBy: ctx.actor.userId, visitDate, agreed },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, ACTIVE_NTN_CONSTRAINT)) throw ntnTaken();
    throw error;
  }

  const [row] = await db.select().from(c).where(eq(c.id, createdId!));
  const view = await buildCompanyView(db, row!);
  const onboarding = await getCompanyOnboarding(ctx.actor, row!.id);
  return { ...view, onboarding: onboarding! };
}

/**
 * Records the first-counter paper review (company representative + staff signatures) and
 * sends the DRAFT company to the verifier queue in the same step. Staff submission needs
 * only what the field visit guarantees — a main contact and a branch. The head office and
 * documents are checked by the verifier, who can request them if they are missing.
 * Verifiers onboard and submit companies the same way; a different verifier reviews
 * them (claimCompany / verifyCompany refuse the creator).
 */
export async function markCompanyRegistrationVerifiedSigned(
  ctx: SignedIn,
  companyId: string,
): Promise<CompanyView> {
  assertRole(ctx.actor, 'STAFF', 'BRANCH_ADMIN', 'SUPER_ADMIN', 'VERIFIER');
  assertPermission(ctx.actor, 'company:onboard');
  const company = await loadCompany(db, companyId);
  if (!isSuperAdmin(ctx.actor)) {
    assertBranchAccess(ctx.actor, company.branchId, {
      entityType: 'company',
      entityId: company.id,
    });
  }
  // Only a company registered by staff after a field visit has a paper form to
  // verify and sign. Employer self-registered DRAFTs must go through the
  // employer's own submit path (with its head-office + documents checks).
  const onboarding = await getCompanyOnboarding(ctx.actor, companyId);
  if (!onboarding) {
    throw new ConflictError(
      'Only a company registered by staff after a field visit can be marked verified and signed.',
      { reason: 'NOT_ONBOARDED' },
    );
  }
  const now = new Date();
  const dueOn = await verificationDueOn(now);
  try {
    await runCommand(ctx, async ({ tx, audit }) => {
      const row = await loadCompany(tx, companyId, { forUpdate: true });
      if (row.status !== 'DRAFT') {
        throw new ConflictError('Only a draft company can be marked verified and signed.');
      }
      if (row.registrationVerifiedSignedAt) {
        throw new ConflictError('This registration form was already marked verified and signed.');
      }
      if (await openVerification(tx, row.id)) {
        throw new ConflictError('This company is already waiting for verification');
      }
      const contactRows = await tx
        .select({ isPrimary: contacts.isPrimary })
        .from(contacts)
        .where(eq(contacts.companyId, row.id));
      const missing: string[] = [];
      if (!contactRows.some((r) => r.isPrimary)) missing.push('a main contact person');
      if (!row.branchId) missing.push('a branch');
      const to = companyMachine.transition(
        row.status,
        'SUBMIT',
        { submissionMissing: missing, documentsNotAccepted: [] },
        ctx.actor.roles,
      );
      const [other] = await tx
        .select({ id: c.id })
        .from(c)
        .where(
          and(eq(c.ntn, row.ntn), notInArray(c.status, ['DRAFT', 'REJECTED']), ne(c.id, row.id)),
        );
      if (other) {
        throw new ConflictError(
          'A company with this NTN is already registered with Saylani Job Bank.',
          { reason: 'NTN_TAKEN' },
        );
      }
      const [{ last } = { last: 0 }] = await tx
        .select({ last: max(ver.round) })
        .from(ver)
        .where(eq(ver.companyId, row.id));
      const [round] = await tx
        .insert(ver)
        .values({
          companyId: row.id,
          branchId: row.branchId!,
          round: (last ?? 0) + 1,
          submittedAt: now,
          clockStartedAt: now,
          slaDueOn: dueOn,
        })
        .returning();
      await tx.update(c).set({ status: to }).where(eq(c.id, row.id));
      await tx
        .update(c)
        .set({
          registrationVerifiedSignedAt: now,
          registrationVerifiedSignedBy: ctx.actor.userId,
        })
        .where(eq(c.id, row.id));
      await recordTransition(tx, {
        verificationId: round!.id,
        companyId: row.id,
        event: 'SUBMIT',
        fromStatus: row.status,
        toStatus: to,
        actorId: ctx.actor.userId,
        metadata: { round: round!.round, slaDueOn: dueOn },
      });
      audit({
        action: 'company.registration_form_verified_signed',
        entityType: 'company',
        entityId: row.id,
        branchId: row.branchId,
        after: { status: row.status, verifiedSigned: true },
        metadata: { verifiedBy: ctx.actor.userId },
      });
      audit({
        action: 'company.submit',
        entityType: 'company',
        entityId: row.id,
        branchId: row.branchId,
        before: { status: row.status },
        after: { status: to },
        metadata: { round: round!.round, slaDueOn: dueOn },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, ACTIVE_NTN_CONSTRAINT)) {
      throw new ConflictError(
        'A company with this NTN is already registered with Saylani Job Bank.',
        { reason: 'NTN_TAKEN' },
      );
    }
    throw error;
  }
  return getCompanyDetail(ctx.actor, companyId);
}

/** Super Admin corrects locked fields (legal name, NTN, etc.) on a verified company. */
export async function correctCompanyDetails(
  ctx: SignedIn,
  companyId: string,
  input: UpdateCompanyInput & { reason: string },
): Promise<CompanyView> {
  assertPermission(ctx.actor, 'company:manage');
  const { reason, ...changes } = input;
  if (Object.keys(changes).length === 0) {
    throw new ValidationError([{ path: 'root', message: 'Change at least one field' }]);
  }
  try {
    await runCommand(ctx, async ({ tx, audit }) => {
      const row = await loadCompany(tx, companyId, { forUpdate: true });
      // A corrected NTN must not collide with another live company (see
      // assertNtnFree). Previously there was no check here at all: the update
      // hit the partial index and failed with a raw 500 instead of a 409.
      if (changes.ntn) await assertNtnFree(tx, changes.ntn, row.id);
      const before = Object.fromEntries(
        Object.keys(changes).map((k) => [k, row[k as keyof typeof row]]),
      );
      await tx.update(c).set(changes).where(eq(c.id, row.id));
      audit({
        action: 'company.correct',
        entityType: 'company',
        entityId: row.id,
        branchId: row.branchId,
        before,
        after: changes,
        metadata: { reason },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, ACTIVE_NTN_CONSTRAINT)) throw ntnTaken();
    throw error;
  }
  return getCompanyDetail(ctx.actor, companyId);
}
