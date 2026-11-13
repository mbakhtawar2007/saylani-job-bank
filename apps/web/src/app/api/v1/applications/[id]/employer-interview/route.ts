import { z } from 'zod';
import {
  scheduleEmployerInterview,
  scheduleEmployerInterviewSchema,
  updateEmployerInterviewStatus,
  updateEmployerInterviewStatusSchema,
} from '@/domains/placement';
import { apiHandler, ok, created } from '@/domains/shared/http';

const params = z.object({ id: z.uuid() });

/** POST /api/v1/applications/{id}/employer-interview — employer schedules their interview. */
export const POST = apiHandler({
  permission: 'decision:employer',
  params,
  body: scheduleEmployerInterviewSchema,
  handler: async ({ ctx, actor, params: p, body }) =>
    created(await scheduleEmployerInterview({ ...ctx, actor: actor! }, p.id, body)),
});

/** PATCH /api/v1/applications/{id}/employer-interview — employer reschedules, postpones or cancels. */
export const PATCH = apiHandler({
  permission: 'decision:employer',
  params,
  body: updateEmployerInterviewStatusSchema,
  handler: async ({ ctx, actor, params: p, body }) =>
    ok(await updateEmployerInterviewStatus({ ...ctx, actor: actor! }, p.id, body)),
});
