import { z } from 'zod';
import { acceptJobOffer } from '@/domains/placement';
import { apiHandler, ok } from '@/domains/shared/http';

const params = z.object({ id: z.uuid() });

/** POST /api/v1/applications/{id}/accept — applicant accepts a job offer. */
export const POST = apiHandler({
  roles: ['APPLICANT'],
  params,
  handler: async ({ ctx, actor, params: p }) =>
    ok(await acceptJobOffer({ ...ctx, actor: actor! }, p.id)),
});
