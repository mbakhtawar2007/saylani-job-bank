import { z } from 'zod';
import { recordEmployerDecision, recordEmployerDecisionSchema } from '@/domains/placement';
import { apiHandler, created } from '@/domains/shared/http';

const params = z.object({ id: z.uuid() });

/** POST /api/v1/applications/{id}/employer-decision — REMOVED 2026-11-12: always 403s for employers (Act of employer removed). */
export const POST = apiHandler({
  permission: 'decision:employer',
  params,
  body: recordEmployerDecisionSchema,
  handler: async ({ ctx, actor, params: p, body }) =>
    created(await recordEmployerDecision({ ...ctx, actor: actor! }, p.id, body)),
});
