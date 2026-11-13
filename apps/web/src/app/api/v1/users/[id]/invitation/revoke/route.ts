import { z } from 'zod';
import { revokeInvitation } from '@/domains/user';
import { apiHandler, ok } from '@/domains/shared/http';

/** POST /api/v1/users/{id}/invitation/revoke — void a pending invitation (old links stop working). */
export const POST = apiHandler({
  permission: 'user:manage',
  params: z.object({ id: z.uuid() }),
  handler: async ({ ctx, actor, params }) =>
    ok(await revokeInvitation({ ...ctx, actor: actor! }, params.id)),
});
