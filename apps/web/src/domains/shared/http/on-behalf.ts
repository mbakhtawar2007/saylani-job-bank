import { schema } from '@jobbank/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { loadActor } from '@/domains/auth';
import { db } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '../errors';
import { assertCityAccess, hasPermission, type Actor } from '../scope';

/**
 * Staff at a counter enter a candidate's data through the same routes job seekers use. Allowed
 * only for candidates registered at a counter (they have no login of their own to act for them)
 * and only in a city the staff member works in.
 */
export async function resolveOnBehalfActor(staff: Actor, applicantId: string): Promise<Actor> {
  if (!hasPermission(staff, 'applicant:manage')) throw new ForbiddenError();
  if (!z.uuid().safeParse(applicantId).success) throw new NotFoundError('Applicant', applicantId);

  const [applicant] = await db
    .select({
      userId: schema.applicants.userId,
      branchId: schema.applicants.branchId,
      counterRegisteredBy: schema.applicants.counterRegisteredBy,
    })
    .from(schema.applicants)
    .where(eq(schema.applicants.id, applicantId));
  if (!applicant) throw new NotFoundError('Applicant', applicantId);
  await assertCityAccess(staff, applicant.branchId, {
    entityType: 'applicant',
    entityId: applicantId,
  });
  if (!applicant.counterRegisteredBy) {
    throw new ForbiddenError('This candidate manages their own account');
  }
  return loadActor(applicant.userId);
}
