import { z } from 'zod';
import { resetStaffTwoFactor } from '@/domains/user';
import { apiHandler, ok } from '@/domains/shared/http';

/** POST /api/v1/users/{id}/two-factor/reset — lost phone: remove their authenticator; reason + the acting admin's own password required (audit 2026-11-11, M-28). */
export const POST = apiHandler({
  permission: 'user:manage',
  params: z.object({ id: z.uuid() }),
  body: z.object({
    reason: z.string().trim().min(5).max(500),
    password: z.string().min(1).max(128),
  }),
  handler: async ({ ctx, actor, params, body }) =>
    ok(
      await resetStaffTwoFactor({ ...ctx, actor: actor! }, params.id, body.reason, body.password),
    ),
});
