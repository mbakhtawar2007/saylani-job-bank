import 'server-only';
import { schema } from '@jobbank/db';
import { permissionsFor } from '@jobbank/shared';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ForbiddenError, NotFoundError } from '@/domains/shared/errors';
import {
  assertCityAccess,
  assertPermission,
  cityScope,
  isSuperAdmin,
  type Actor,
} from '@/domains/shared/scope';
import { db } from '@/lib/db';

const c = schema.companies;

export interface ActingEmployer {
  actor: Actor;
  companyName: string;
}

/**
 * Staff and Branch Admins acting for an employer that cannot use the system itself. The result
 * is an employer actor for that one company, keeping the staff member's own user id, so every
 * record it creates (jobs, decisions, messages) names the person who really did it.
 *
 * Why actor synthesis instead of the `decision:proxy` permission: `decision:proxy` is
 * deliberately unassigned in the permission model (PRD §4, both repos) — no role holds it,
 * so gating on it would let nobody act. The gate here is the staff member's own
 * `match_case:manage` permission plus VERIFIED-company and city scope, and the
 * synthesised actor carries only the EMPLOYER role's permissions for that one
 * companyId. Everything the synthesised actor does then runs through the same
 * employer rules as a real employer: employer read-only for VERIFIED companies
 * (DRAFT fully editable; OPEN only description / other-requirements / benefits /
 * application instructions; company never changeable) and the verified-signed
 * gates all still apply — acting for an employer cannot bypass them.
 */
export async function actingForEmployer(staff: Actor, companyId: string): Promise<ActingEmployer> {
  assertPermission(staff, 'match_case:manage');
  // Super Admins oversee; they do not make decisions for employers.
  if (isSuperAdmin(staff)) throw new ForbiddenError();
  if (!z.uuid().safeParse(companyId).success) throw new NotFoundError('Company', companyId);

  const [company] = await db
    .select({
      id: c.id,
      branchId: c.branchId,
      status: c.status,
      tradeName: c.tradeName,
      legalName: c.legalName,
    })
    .from(c)
    .where(eq(c.id, companyId));
  if (!company) throw new NotFoundError('Company', companyId);
  await assertCityAccess(staff, company.branchId, { entityType: 'company', entityId: company.id });
  if (company.status !== 'VERIFIED') {
    throw new ForbiddenError('Only verified companies can be managed');
  }

  return {
    companyName: company.tradeName ?? company.legalName,
    actor: {
      userId: staff.userId,
      roles: ['EMPLOYER'],
      permissions: permissionsFor(['EMPLOYER']),
      branchIds: [],
      activeBranchId: null,
      companyId: company.id,
      applicantId: null,
      twoFactorPending: staff.twoFactorPending,
    },
  };
}

export interface ManagedEmployer {
  id: string;
  name: string;
  legalName: string;
}

/** Verified companies in the cities this staff member works in. */
export async function listManagedEmployers(staff: Actor): Promise<ManagedEmployer[]> {
  assertPermission(staff, 'match_case:manage');
  const rows = await db
    .select({ id: c.id, tradeName: c.tradeName, legalName: c.legalName })
    .from(c)
    .where(and(eq(c.status, 'VERIFIED'), cityScope(staff, c.branchId)))
    .orderBy(asc(c.legalName))
    .limit(500);
  return rows.map((r) => ({ id: r.id, name: r.tradeName ?? r.legalName, legalName: r.legalName }));
}
