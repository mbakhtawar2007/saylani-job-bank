import 'server-only';
import { schema } from '@jobbank/db';
import {
  APPLICANT_STATUSES,
  IDENTITY_STATUSES,
  ROLE_LABELS,
  ROLES,
  type ApplicantStatus,
  type IdentityMethod,
  type IdentityOutcome,
  type IdentityStatus,
  type IdentityVerificationInput,
  type Role,
  type StaffRegisterApplicantInput,
  type UpdatePersonalInput,
} from '@jobbank/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';
import { isPlaceholderEmail, placeholderEmailFor } from '@/domains/auth';
import { getBranchContact, type BranchContact } from '@/domains/branch';
import { assertActiveMasterData, masterDataLabels } from '@/domains/settings';
import { recordAudit, runCommand } from '@/domains/shared/audit';
import {
  ConflictError,
  ForbiddenError,
  isUniqueViolation,
  ScopeViolationError,
  ValidationError,
} from '@/domains/shared/errors';
import { maskCnic, maskPhone } from '@/domains/shared/masking';
import { paginationMeta, type ListQuery } from '@/domains/shared/pagination';
import { multiCode, multiEnum, multiUuid } from '@/domains/shared/filters';
import {
  assertCityAccess,
  assertBranchAccess,
  assertPermission,
  assertRole,
  hasPermission,
  isSuperAdmin,
  type Actor,
} from '@/domains/shared/scope';
import { db } from '@/lib/db';
import { normalizePkMobile } from '@/lib/format/phone';
import { applicantMachine } from './machine';
import { assertEmailFree, cnicTakenError, IDENTITY_FIELDS } from './profile';
import {
  a,
  addr,
  buildProfile,
  cert,
  cnicOwner,
  currentDocuments,
  docs,
  edu,
  exp,
  idv,
  loadApplicant,
  lng,
  permAddr,
  pref,
  refreshProfileState,
  skl,
  completenessFor,
  type ApplicantProfile,
  type ApplicantRow,
  type SignedIn,
} from './repository';
import { completeTokenForRegistration } from './tokens';
import type { DbExecutor } from '@/lib/db';

/** City must be active master data; an area must belong to that city. */
async function assertCityArea(
  executor: DbExecutor,
  address: { cityCode: string; areaCode: string | null },
  path: string,
): Promise<void> {
  const city = (
    await assertActiveMasterData(executor, 'CITY', [address.cityCode], () => `${path}.cityCode`)
  ).get(address.cityCode)!;
  if (address.areaCode) {
    const area = (
      await assertActiveMasterData(executor, 'AREA', [address.areaCode], () => `${path}.areaCode`)
    ).get(address.areaCode)!;
    if (area.parentId !== city.id) {
      throw new ValidationError([
        { path: `${path}.areaCode`, message: `This area is not in ${city.label}` },
      ]);
    }
  }
}

// ─── Search ────────────────────────────────────────────────────────────

export const APPLICANT_SORTABLE = ['fullName', 'createdAt', 'profileCompleteness'] as const;

/** YYYY-MM-DD; validated by parseListQuery, range checked in listApplicants. */
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-07')
  .optional();

export const applicantFilters = {
  /** Multi-select (Daraz/OLX-style checkboxes): one repeated key per ticked box. */
  status: multiEnum(APPLICANT_STATUSES),
  identityStatus: multiEnum(IDENTITY_STATUSES),
  branchId: multiUuid,
  cityCode: multiCode,
  areaCode: multiCode,
  skillCode: multiCode,
  /** Registration date range (inclusive, Pakistan day boundaries — M1). */
  createdFrom: dateOnlySchema,
  createdTo: dateOnlySchema,
};

/** Start of a YYYY-MM-DD day in Pakistan time, as a Date. */
const pktDayStart = (day: string): Date => new Date(`${day}T00:00:00.000+05:00`);

/** The calendar day after a YYYY-MM-DD date. */
const nextDay = (day: string): string => {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export interface ApplicantListItem {
  id: string;
  fullName: string;
  /** "42101-•••••••-1": lists never show the full CNIC. */
  cnicMasked: string;
  phoneMasked: string | null;
  status: ApplicantStatus;
  identityStatus: IdentityStatus;
  profileCompleteness: number;
  branchName: string | null;
  cityLabel: string | null;
  areaLabel: string | null;
  createdAt: string;
}

export async function listApplicants(
  actor: Actor,
  query: ListQuery<
    (typeof APPLICANT_SORTABLE)[number],
    {
      status?: ApplicantStatus[];
      identityStatus?: IdentityStatus[];
      branchId?: string[];
      cityCode?: string[];
      areaCode?: string[];
      skillCode?: string[];
      createdFrom?: string;
      createdTo?: string;
    }
  >,
) {
  assertPermission(actor, 'applicant:read');
  const f = query.filters;
  if (f.createdFrom && f.createdTo && f.createdFrom > f.createdTo) {
    throw new ValidationError([
      { path: 'createdFrom', message: 'Registered from must be on or before Registered to' },
    ]);
  }
  const outOfScopeBranch =
    f.branchId && !isSuperAdmin(actor)
      ? f.branchId.find((id) => !actor.branchIds.includes(id))
      : undefined;
  if (outOfScopeBranch) {
    throw new ScopeViolationError(undefined, {
      entityType: 'branch',
      entityId: outOfScopeBranch,
      branchId: outOfScopeBranch,
    });
  }

  // City-based scoping: staff see all applicants whose city matches any city of their branches.
  // A branch stores its city as a display name ("Rahim Yar Khan") while the applicant address
  // stores the master-data CITY code ("RAHIM_YAR_KHAN"), so the comparison goes through the
  // CITY label (M30) — never branch name vs city code. A Super Admin with a branch selected
  // in the switcher sees only that branch's applicants, like every other dashboard count (H9).
  const cityScope: SQL | undefined = isSuperAdmin(actor)
    ? actor.activeBranchId
      ? eq(a.branchId, actor.activeBranchId)
      : undefined
    : actor.branchIds.length === 0
      ? sql`false`
      : exists(
          db
            .select({ one: sql`1` })
            .from(schema.branches)
            .where(
              and(
                inArray(schema.branches.id, actor.branchIds),
                exists(
                  db
                    .select({ one: sql`1` })
                    .from(schema.masterData)
                    .where(
                      and(
                        eq(schema.masterData.type, 'CITY'),
                        eq(schema.masterData.code, addr.cityCode),
                        sql`upper(${schema.masterData.label}) = upper(${schema.branches.city})`,
                      ),
                    ),
                ),
              ),
            ),
        );

  const conditions: (SQL | undefined)[] = [
    cityScope,
    f.status?.length ? inArray(a.status, f.status) : undefined,
    f.identityStatus?.length ? inArray(a.identityStatus, f.identityStatus) : undefined,
    f.branchId?.length ? inArray(a.branchId, f.branchId) : undefined,
    f.cityCode?.length ? inArray(addr.cityCode, f.cityCode) : undefined,
    f.areaCode?.length ? inArray(addr.areaCode, f.areaCode) : undefined,
    // Registration date range: from is the start of that day in Pakistan time,
    // to is the end (exclusive start of the next Pakistan day).
    f.createdFrom ? gte(a.createdAt, pktDayStart(f.createdFrom)) : undefined,
    f.createdTo ? lt(a.createdAt, pktDayStart(nextDay(f.createdTo))) : undefined,
    f.skillCode?.length
      ? exists(
          db
            .select({ one: sql`1` })
            .from(skl)
            .where(and(eq(skl.applicantId, a.id), inArray(skl.skillCode, f.skillCode))),
        )
      : undefined,
  ];
  if (query.q) {
    // Names by substring; CNIC and phone by their digits (staff often have only one of them);
    // city/area by the label staff see ("Gulshan" finds Gulshan-e-Iqbal).
    const digits = query.q.replace(/\D/g, '');
    const phone = digits.length >= 10 ? normalizePkMobile(digits) : null;
    conditions.push(
      or(
        ilike(a.fullName, `%${query.q}%`),
        digits.length >= 5 ? sql`${a.cnic} like ${`${digits}%`}` : undefined,
        phone ? eq(schema.users.phoneNumber, phone) : undefined,
        exists(
          db
            .select({ one: sql`1` })
            .from(schema.masterData)
            .where(
              and(
                inArray(schema.masterData.type, ['CITY', 'AREA']),
                ilike(schema.masterData.label, `%${query.q}%`),
                or(
                  eq(schema.masterData.code, addr.cityCode),
                  eq(schema.masterData.code, addr.areaCode),
                ),
              ),
            ),
        ),
      ),
    );
  }
  const where = and(...conditions);

  const sortColumn = {
    fullName: a.fullName,
    createdAt: a.createdAt,
    profileCompleteness: a.profileCompleteness,
  }[query.sort.field];
  const base = () =>
    db
      .select({
        id: a.id,
        fullName: a.fullName,
        cnic: a.cnic,
        phone: schema.users.phoneNumber,
        status: a.status,
        identityStatus: a.identityStatus,
        profileCompleteness: a.profileCompleteness,
        branchName: schema.branches.name,
        cityCode: addr.cityCode,
        areaCode: addr.areaCode,
        createdAt: a.createdAt,
      })
      .from(a)
      .innerJoin(schema.users, eq(schema.users.id, a.userId))
      .leftJoin(schema.branches, eq(schema.branches.id, a.branchId))
      .leftJoin(addr, eq(addr.applicantId, a.id));

  const [rows, [total], labels] = await Promise.all([
    base()
      .where(where)
      .orderBy(query.sort.direction === 'asc' ? asc(sortColumn) : desc(sortColumn), asc(a.id))
      .limit(query.limit)
      .offset(query.offset),
    db
      .select({ value: count() })
      .from(a)
      .innerJoin(schema.users, eq(schema.users.id, a.userId))
      .leftJoin(addr, eq(addr.applicantId, a.id))
      .where(where),
    masterDataLabels(['CITY', 'AREA']),
  ]);

  return {
    data: rows.map((row): ApplicantListItem => ({
      id: row.id,
      fullName: row.fullName,
      cnicMasked: maskCnic(row.cnic),
      phoneMasked: row.phone ? maskPhone(row.phone) : null,
      status: row.status,
      identityStatus: row.identityStatus,
      profileCompleteness: row.profileCompleteness,
      branchName: row.branchName,
      cityLabel: row.cityCode ? (labels.CITY?.[row.cityCode] ?? row.cityCode) : null,
      areaLabel: row.areaCode ? (labels.AREA?.[row.areaCode] ?? row.areaCode) : null,
      createdAt: row.createdAt.toISOString(),
    })),
    meta: paginationMeta(query, total?.value ?? 0),
  };
}

// ─── Detail ────────────────────────────────────────────────────────────

export interface IdentityCheckView {
  id: string;
  outcome: IdentityOutcome;
  method: IdentityMethod;
  notes: string | null;
  verifiedByName: string | null;
  createdAt: string;
  /** False when the CNIC was corrected after this check. */
  cnicMatchesCurrent: boolean;
}

export interface ApplicantStaffView extends ApplicantProfile {
  userId: string;
  statusReason: string | null;
  createdByStaff: { name: string | null; roleLabel: string | null } | null;
  identityHistory: IdentityCheckView[];
  /** What the signed-in staff member may do (drives the UI). */
  can: {
    verifyIdentity: boolean;
    manage: boolean;
    transfer: boolean;
    shortlist: boolean;
    scheduleInterview: boolean;
    referToEmployer: boolean;
  };
}

async function scopedApplicant(actor: Actor, applicantId: string): Promise<ApplicantRow> {
  const row = await loadApplicant(db, applicantId);
  await assertCityAccess(actor, row.branchId, { entityType: 'applicant', entityId: row.id });
  return row;
}

/** Staff creates an applicant profile for a person at the branch. It is ACTIVE from creation (no DRAFT status since 2026-11-09). */
export async function staffRegisterApplicant(
  ctx: SignedIn,
  input: StaffRegisterApplicantInput,
): Promise<ApplicantStaffView> {
  assertPermission(ctx.actor, 'applicant:manage');
  if (!isSuperAdmin(ctx.actor)) assertBranchAccess(ctx.actor, input.branchId);

  const phone = normalizePkMobile(input.phone);
  if (!phone) {
    throw new ValidationError([{ path: 'phone', message: 'Enter a Pakistani mobile number' }]);
  }

  try {
    let applicantId: string | undefined;
    await runCommand(ctx, async (cmd) => {
      const { tx, audit } = cmd;
      const owner = await cnicOwner(tx, input.cnic);
      if (owner) throw await cnicTakenError(tx, owner);
      if (input.email) await assertEmailFree(tx, input.email);

      const [existingPhone] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.phoneNumber, phone));
      if (existingPhone) {
        throw new ConflictError('This number is already registered. Please use account recovery.');
      }

      const [user] = await tx
        .insert(schema.users)
        .values({
          name: input.fullName,
          email: placeholderEmailFor(phone),
          phoneNumber: phone,
          phoneNumberVerified: false,
        })
        .returning({ id: schema.users.id });
      await tx.insert(schema.userRoles).values({ userId: user!.id, roleCode: 'APPLICANT' });

      const [row] = await tx
        .insert(a)
        .values({
          userId: user!.id,
          branchId: input.branchId,
          fullName: input.fullName,
          fatherName: input.fatherName,
          cnic: input.cnic,
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          email: input.email ?? null,
          additionalNotes: input.additionalNotes ?? null,
          activatedAt: new Date(),
        })
        .returning();
      applicantId = row!.id;

      if (input.address) {
        await assertCityArea(tx, input.address, 'address');
        await tx.insert(addr).values({
          applicantId: row!.id,
          addressLine: input.address.addressLine ?? '',
          cityCode: input.address.cityCode,
          areaCode: input.address.areaCode,
          location: input.address.location,
        });
      }

      if (input.permanentAddress) {
        await assertCityArea(tx, input.permanentAddress, 'permanentAddress');
        await tx.insert(permAddr).values({
          applicantId: row!.id,
          addressLine: input.permanentAddress.addressLine,
          cityCode: input.permanentAddress.cityCode,
          areaCode: input.permanentAddress.areaCode,
        });
      }

      if (input.education) {
        await assertActiveMasterData(
          tx,
          'EDUCATION_LEVEL',
          input.education.items.map((item) => item.levelCode),
          (index) => `education.items.${index}.levelCode`,
        );
        if (input.education.items.length) {
          await tx.insert(edu).values(
            input.education.items.map((item, sortOrder) => ({
              ...item,
              applicantId: row!.id,
              sortOrder,
            })),
          );
        }
      }

      if (input.experience) {
        const categories = input.experience.items.flatMap((item, index) =>
          item.categoryCode ? [{ code: item.categoryCode, index }] : [],
        );
        if (categories.length) {
          await assertActiveMasterData(
            tx,
            'JOB_CATEGORY',
            categories.map((item) => item.code),
            (index) => `experience.items.${categories[index]!.index}.categoryCode`,
          );
        }
        if (input.experience.items.length) {
          await tx.insert(exp).values(
            input.experience.items.map((item, sortOrder) => ({
              ...item,
              startMonth: `${item.startMonth}-01`,
              endMonth: item.endMonth ? `${item.endMonth}-01` : null,
              applicantId: row!.id,
              sortOrder,
            })),
          );
        }
        await tx
          .update(a)
          .set({ hasNoExperience: input.experience.hasNoExperience })
          .where(eq(a.id, row!.id));
      }

      if (input.skills?.items.length) {
        // Skills must already exist as active master data (H14): staff may not
        // mint new SKILL codes — an unknown code is "not offered", like every
        // other section in this form.
        await assertActiveMasterData(
          tx,
          'SKILL',
          input.skills.items.map((item) => item.skillCode),
          (index) => `skills.items.${index}.skillCode`,
        );
        await tx
          .insert(skl)
          .values(input.skills.items.map((item) => ({ ...item, applicantId: row!.id })));
      }

      if (input.languages) {
        await assertActiveMasterData(
          tx,
          'LANGUAGE',
          input.languages.items.map((item) => item.languageCode),
          (index) => `languages.items.${index}.languageCode`,
        );
        if (input.languages.items.length) {
          await tx
            .insert(lng)
            .values(input.languages.items.map((item) => ({ ...item, applicantId: row!.id })));
        }
      }

      if (input.certifications?.items.length) {
        await tx.insert(cert).values(
          input.certifications.items.map((item, sortOrder) => ({
            name: item.name,
            issuer: item.issuer,
            issuedMonth: item.issuedMonth ? `${item.issuedMonth}-01` : null,
            expiresMonth: item.expiresMonth ? `${item.expiresMonth}-01` : null,
            applicantId: row!.id,
            sortOrder,
          })),
        );
      }

      if (input.preferences) {
        await assertActiveMasterData(
          tx,
          'JOB_CATEGORY',
          input.preferences.categoryCodes,
          (index) => `preferences.categoryCodes.${index}`,
        );
        await tx.insert(pref).values({
          applicantId: row!.id,
          ...input.preferences,
        });
      }

      // Step 2 (2026-11-08): a registration that names a first-counter token
      // completes it in this same transaction — the token must be ISSUED,
      // unexpired, for this branch and CNIC, or the whole registration fails.
      if (input.tokenId) {
        await completeTokenForRegistration(tx, audit, {
          tokenId: input.tokenId,
          applicantId: row!.id,
          branchId: input.branchId,
          cnic: input.cnic,
        });
      }

      audit({
        action: 'applicant.register_by_staff',
        entityType: 'applicant',
        entityId: row!.id,
        branchId: input.branchId,
        after: {
          fullName: input.fullName,
          fatherName: input.fatherName,
          cnic: input.cnic,
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          email: input.email ?? null,
          phone,
          branchId: input.branchId,
          profile: {
            address: input.address,
            permanentAddress: input.permanentAddress,
            additionalNotes: input.additionalNotes ?? null,
            education: input.education,
            experience: input.experience,
            skills: input.skills,
            languages: input.languages,
            certifications: input.certifications,
            preferences: input.preferences,
          },
        },
        metadata: { createdBy: ctx.actor.userId, tokenId: input.tokenId ?? null },
      });
      // Recompute completeness in the same step (profiles are ACTIVE from
      // creation; there is no activation step any more).
      await refreshProfileState(cmd, row!.id);
    });

    if (!applicantId) throw new Error('Applicant registration completed without an applicant.');
    return getApplicantForStaff(ctx.actor, applicantId);
  } catch (error) {
    if (
      isUniqueViolation(error, 'applicants_cnic_unique') ||
      (error instanceof ConflictError &&
        (error.details as { reason?: string } | undefined)?.reason === 'CNIC_TAKEN')
    ) {
      const owner = await cnicOwner(db, input.cnic);
      if (owner) {
        await recordAudit(ctx, {
          action: 'applicant.register_duplicate_cnic',
          entityType: 'applicant',
          entityId: owner.id,
          branchId: input.branchId,
          metadata: { createdBy: ctx.actor.userId },
        });
        throw await cnicTakenError(db, owner);
      }
    }
    if (isUniqueViolation(error, 'users_phone_number_unique')) {
      const [phoneOwner] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.phoneNumber, phone));
      await recordAudit(ctx, {
        action: 'applicant.register_duplicate_phone',
        entityType: 'user',
        entityId: phoneOwner?.id,
        branchId: input.branchId,
        metadata: { createdBy: ctx.actor.userId },
      });
      throw new ConflictError('This number is already registered. Please use account recovery.');
    }
    if (isUniqueViolation(error)) {
      // Any other unique violation (e.g. a placeholder-email collision) is not a
      // phone conflict — do not misreport it as one.
      throw new ConflictError(
        'This registration could not be saved because some details are already in use.',
      );
    }
    throw error;
  }
}

/**
 * Records the first-counter paper review.
 *
 * Deliberate asymmetry with companies, kept as a product decision: for companies the
 * verified-and-signed mark GATES the next step (markCompanyRegistrationVerifiedSigned
 * submits the DRAFT to the verifier queue in the same step). For applicants it is
 * record-only evidence of the paper review — it does NOT gate anything. Nothing in
 * the codebase gates applicant activation or matching on
 * registrationVerifiedSignedAt; the timestamp is the audit evidence that the
 * first-counter review happened. (The old DRAFT-only gate is gone with the
 * DRAFT status itself, removed 2026-11-09.)
 */
export async function markApplicantRegistrationVerifiedSigned(
  ctx: SignedIn,
  applicantId: string,
): Promise<{ verifiedSignedAt: Date; verifiedSignedBy: string }> {
  assertRole(ctx.actor, 'STAFF', 'BRANCH_ADMIN', 'SUPER_ADMIN');
  assertPermission(ctx.actor, 'applicant:manage');
  const applicant = await loadApplicant(db, applicantId);
  if (!isSuperAdmin(ctx.actor)) {
    assertBranchAccess(ctx.actor, applicant.branchId, {
      entityType: 'applicant',
      entityId: applicant.id,
    });
  }
  const verifiedAt = new Date();
  await runCommand(ctx, async ({ tx, audit }) => {
    const row = await loadApplicant(tx, applicantId, { forUpdate: true });
    if (row.registrationVerifiedSignedAt) {
      throw new ConflictError('This registration form was already marked verified and signed.');
    }
    await tx
      .update(a)
      .set({
        registrationVerifiedSignedAt: verifiedAt,
        registrationVerifiedSignedBy: ctx.actor.userId,
      })
      .where(eq(a.id, row.id));
    audit({
      action: 'applicant.registration_form_verified_signed',
      entityType: 'applicant',
      entityId: row.id,
      branchId: row.branchId,
      after: { status: row.status, verifiedSigned: true },
      metadata: { verifiedBy: ctx.actor.userId },
    });
  });
  return { verifiedSignedAt: verifiedAt, verifiedSignedBy: ctx.actor.userId };
}

export async function getApplicantForStaff(
  actor: Actor,
  applicantId: string,
): Promise<ApplicantStaffView> {
  assertPermission(actor, 'applicant:read');
  const row = await scopedApplicant(actor, applicantId);
  const [profile, history, staffCreator] = await Promise.all([
    buildProfile(db, row),
    db
      .select({
        id: idv.id,
        outcome: idv.outcome,
        method: idv.method,
        notes: idv.notes,
        cnic: idv.cnic,
        verifiedByName: schema.users.name,
        createdAt: idv.createdAt,
      })
      .from(idv)
      .leftJoin(schema.users, eq(schema.users.id, idv.verifiedBy))
      .where(eq(idv.applicantId, row.id))
      .orderBy(desc(idv.createdAt)),
    db
      .select({ name: schema.users.name, actorRole: schema.auditLogs.actorRole })
      .from(schema.auditLogs)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLogs.actorUserId))
      .where(
        and(
          eq(schema.auditLogs.action, 'applicant.register_by_staff'),
          eq(schema.auditLogs.entityType, 'applicant'),
          eq(schema.auditLogs.entityId, row.id),
        ),
      )
      .orderBy(asc(schema.auditLogs.occurredAt), asc(schema.auditLogs.id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);
  const creatorRole = staffCreator
    ? ROLES.find((role: Role) => staffCreator.actorRole?.split(',').includes(role))
    : undefined;
  return {
    ...profile,
    userId: row.userId,
    statusReason: row.statusReason,
    createdByStaff: staffCreator
      ? { name: staffCreator.name, roleLabel: creatorRole ? ROLE_LABELS[creatorRole] : null }
      : null,
    identityHistory: history.map((h) => ({
      id: h.id,
      outcome: h.outcome,
      method: h.method,
      notes: h.notes,
      verifiedByName: h.verifiedByName,
      createdAt: h.createdAt.toISOString(),
      cnicMatchesCurrent: h.cnic === row.cnic,
    })),
    can: {
      verifyIdentity:
        hasPermission(actor, 'applicant:verify_identity') && actor.userId !== row.userId,
      manage: hasPermission(actor, 'applicant:manage'),
      transfer: hasPermission(actor, 'applicant:transfer'),
      shortlist: hasPermission(actor, 'match_case:manage') && row.status === 'ACTIVE',
      scheduleInterview:
        hasPermission(actor, 'interview:schedule_jobbank') && row.status === 'ACTIVE',
      referToEmployer: hasPermission(actor, 'match_case:refer') && row.status === 'ACTIVE',
    },
  };
}

// ─── Identity verification ─────────────────────────────────────────────

/**
 * Records a staff identity check (append-only) and updates the applicant's identity status.
 * A VERIFIED outcome needs the CNIC evidence behind it whatever the method: both uploaded
 * sides, or — for an in-person check — a note saying the original card was seen. A document
 * review marks those documents accepted or rejected along with the check.
 */
export async function verifyApplicantIdentity(
  ctx: SignedIn,
  applicantId: string,
  input: IdentityVerificationInput,
): Promise<ApplicantStaffView> {
  assertPermission(ctx.actor, 'applicant:verify_identity');
  await scopedApplicant(ctx.actor, applicantId);
  await runCommand(ctx, async ({ tx, audit }) => {
    const row = await loadApplicant(tx, applicantId, { forUpdate: true });
    if (row.userId === ctx.actor.userId) {
      throw new ForbiddenError('You cannot verify your own identity');
    }
    if (input.outcome === 'VERIFIED' && row.identityStatus === 'VERIFIED') {
      throw new ConflictError('This identity is already verified');
    }
    const current = await currentDocuments(tx, row.id);
    const front = current.find((d) => d.typeCode === 'CNIC_FRONT') ?? null;
    const back = current.find((d) => d.typeCode === 'CNIC_BACK') ?? null;
    if (input.outcome === 'VERIFIED') {
      // A VERIFIED mark needs the CNIC evidence behind it, whatever the method (L18):
      // both uploaded sides, or — for an in-person check — a written note saying
      // the original card was seen (that note is the method-specific justification).
      const inPersonJustification =
        input.method === 'IN_PERSON' && (input.notes?.trim().length ?? 0) >= 5;
      if (!front || !back) {
        if (!inPersonJustification) {
          throw new ConflictError(
            'To mark this identity verified, the applicant must have uploaded both sides of ' +
              'their CNIC, or — for an in-person check — record in the notes that you saw the original card.',
          );
        }
      }
    }
    const now = new Date();
    await tx.insert(idv).values({
      applicantId: row.id,
      cnic: row.cnic,
      method: input.method,
      outcome: input.outcome,
      notes: input.notes,
      frontDocumentId: front?.id ?? null,
      backDocumentId: back?.id ?? null,
      verifiedBy: ctx.actor.userId,
    });
    await tx.update(a).set({ identityStatus: input.outcome }).where(eq(a.id, row.id));
    if (input.method === 'DOCUMENT_REVIEW') {
      await tx
        .update(docs)
        .set({
          status: input.outcome === 'VERIFIED' ? 'ACCEPTED' : 'REJECTED',
          reviewNote: input.outcome === 'VERIFIED' ? null : input.notes,
          reviewedBy: ctx.actor.userId,
          reviewedAt: now,
        })
        .where(inArray(docs.id, [front!.id, back!.id]));
    }
    audit({
      action:
        input.outcome === 'VERIFIED' ? 'applicant.identity_verify' : 'applicant.identity_reject',
      entityType: 'applicant',
      entityId: row.id,
      branchId: row.branchId,
      before: { identityStatus: row.identityStatus },
      after: { identityStatus: input.outcome, method: input.method },
      reason: input.notes,
    });
  });
  return getApplicantForStaff(ctx.actor, applicantId);
}

// ─── Corrections & account recovery ────────────────────────────────────

/**
 * Staff correct personal details (e.g. a typo found during the identity check). Changing an
 * identity field resets the identity status, so the profile is checked again.
 */
export async function staffUpdateApplicant(
  ctx: SignedIn,
  applicantId: string,
  input: UpdatePersonalInput & { reason: string },
): Promise<ApplicantStaffView> {
  assertPermission(ctx.actor, 'applicant:manage');
  const { reason, ...fields } = input;
  await scopedApplicant(ctx.actor, applicantId);
  try {
    await runCommand(ctx, async ({ tx, audit }) => {
      const row = await loadApplicant(tx, applicantId, { forUpdate: true });
      const changes = Object.fromEntries(
        Object.entries(fields).filter(
          ([k, v]) => v !== undefined && v !== row[k as keyof ApplicantRow],
        ),
      ) as UpdatePersonalInput;
      if (Object.keys(changes).length === 0) throw new ConflictError('Nothing was changed');
      if (changes.cnic) {
        const owner = await cnicOwner(tx, changes.cnic, row.id);
        if (owner) throw await cnicTakenError(tx, owner);
      }
      if (changes.email) await assertEmailFree(tx, changes.email, row.id);
      const identityChanged = IDENTITY_FIELDS.some((field) => field in changes);
      await tx
        .update(a)
        .set({
          ...changes,
          identityStatus: identityChanged ? 'UNVERIFIED' : row.identityStatus,
        })
        .where(eq(a.id, row.id));
      if (changes.fullName) {
        await tx
          .update(schema.users)
          .set({ name: changes.fullName })
          .where(eq(schema.users.id, row.userId));
      }
      audit({
        action: 'applicant.staff_update',
        entityType: 'applicant',
        entityId: row.id,
        branchId: row.branchId,
        before: Object.fromEntries(
          Object.keys(changes).map((k) => [k, row[k as keyof ApplicantRow]]),
        ),
        after: changes,
        reason,
        metadata: { identityReset: identityChanged && row.identityStatus !== 'UNVERIFIED' },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, 'applicants_cnic_unique')) {
      throw new ConflictError('Another applicant already has this CNIC');
    }
    throw error;
  }
  return getApplicantForStaff(ctx.actor, applicantId);
}

/**
 * Account recovery (owner decision 3): the applicant lost their SIM, or registered the CNIC
 * from another number. Staff move the profile to the new number; old sessions end.
 */
export async function changeApplicantPhone(
  ctx: SignedIn,
  applicantId: string,
  input: { phone: string; reason: string },
): Promise<ApplicantStaffView> {
  assertPermission(ctx.actor, 'applicant:manage');
  const phone = normalizePkMobile(input.phone);
  if (!phone) {
    throw new ValidationError([{ path: 'phone', message: 'Enter a Pakistani mobile number' }]);
  }
  await scopedApplicant(ctx.actor, applicantId);
  try {
    await runCommand(ctx, async ({ tx, audit }) => {
      const row = await loadApplicant(tx, applicantId, { forUpdate: true });
      const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, row.userId));
      if (user!.phoneNumber === phone) throw new ConflictError('This is already their number');
      const [taken] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.phoneNumber, phone));
      if (taken) {
        throw new ConflictError(
          'This number is used by another account. That account must be closed first.',
        );
      }
      await tx
        .update(schema.users)
        .set({
          phoneNumber: phone,
          phoneNumberVerified: true,
          // The placeholder email is derived from the phone, so a new sign-up with the old
          // number must not collide with it.
          ...(isPlaceholderEmail(user!.email) ? { email: placeholderEmailFor(phone) } : {}),
        })
        .where(eq(schema.users.id, row.userId));
      await tx.delete(schema.sessions).where(eq(schema.sessions.userId, row.userId));
      audit({
        action: 'applicant.phone_change',
        entityType: 'applicant',
        entityId: row.id,
        branchId: row.branchId,
        reason: input.reason,
        metadata: {
          from: user!.phoneNumber ? maskPhone(user!.phoneNumber) : null,
          to: maskPhone(phone),
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        'This number is used by another account. That account must be closed first.',
      );
    }
    throw error;
  }
  return getApplicantForStaff(ctx.actor, applicantId);
}

/** Staff deactivate (e.g. unreachable, found work elsewhere) or reactivate, with a reason. */
export async function staffSetApplicantStatus(
  ctx: SignedIn,
  applicantId: string,
  input: { status: 'ACTIVE' | 'INACTIVE'; reason: string },
): Promise<ApplicantStaffView> {
  assertPermission(ctx.actor, 'applicant:manage');
  await scopedApplicant(ctx.actor, applicantId);
  await runCommand(ctx, async ({ tx, audit }) => {
    const row = await loadApplicant(tx, applicantId, { forUpdate: true });
    const event = input.status === 'INACTIVE' ? 'DEACTIVATE' : 'REACTIVATE';
    // REACTIVATE re-checks completeness (the machine guards it): a profile that
    // lost its documents or location while inactive must not come back ACTIVE
    // and matchable. DEACTIVATE needs no such check, so it is not computed.
    const activationMissing =
      event === 'REACTIVATE' ? (await completenessFor(tx, row)).activationMissing : [];
    const to = applicantMachine.transition(
      row.status,
      event,
      { activationMissing },
      ctx.actor.roles,
    );
    await tx
      .update(a)
      .set({ status: to, statusReason: input.status === 'INACTIVE' ? input.reason : null })
      .where(eq(a.id, row.id));
    audit({
      action: input.status === 'INACTIVE' ? 'applicant.deactivate' : 'applicant.reactivate',
      entityType: 'applicant',
      entityId: row.id,
      branchId: row.branchId,
      before: { status: row.status },
      after: { status: to },
      reason: input.reason,
      metadata: { by: 'staff' },
    });
  });
  return getApplicantForStaff(ctx.actor, applicantId);
}

/**
 * Branch Admin (of the current branch) or Super Admin moves an applicant to another branch.
 * Returns only the new branch: a Branch Admin can no longer open the profile afterwards.
 */
export async function transferApplicant(
  ctx: SignedIn,
  applicantId: string,
  input: { branchId: string; reason: string },
): Promise<{ applicantId: string; branch: BranchContact }> {
  assertPermission(ctx.actor, 'applicant:transfer');
  await scopedApplicant(ctx.actor, applicantId);
  return runCommand(ctx, async ({ tx, audit }) => {
    const row = await loadApplicant(tx, applicantId, { forUpdate: true });
    if (row.branchId === input.branchId) {
      throw new ConflictError('The applicant is already in this branch');
    }
    const target = await getBranchContact(input.branchId, tx);
    if (!target?.isActive) {
      throw new ValidationError([{ path: 'branchId', message: 'Choose an active branch' }]);
    }
    // The destination must be one of the actor's own branches (M13) — a Branch
    // Admin cannot move an applicant to a branch in another city. Super Admins
    // move applicants anywhere.
    if (!isSuperAdmin(ctx.actor) && !ctx.actor.branchIds.includes(input.branchId)) {
      throw new ScopeViolationError(undefined, {
        entityType: 'branch',
        entityId: input.branchId,
        branchId: input.branchId,
      });
    }
    await tx.update(a).set({ branchId: input.branchId }).where(eq(a.id, row.id));
    audit({
      action: 'applicant.transfer',
      entityType: 'applicant',
      entityId: row.id,
      branchId: input.branchId,
      before: { branchId: row.branchId },
      after: { branchId: input.branchId },
      reason: input.reason,
    });
    return { applicantId: row.id, branch: target };
  });
}
