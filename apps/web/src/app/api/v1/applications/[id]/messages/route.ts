import { z } from 'zod';
import { listMessages, sendMessage } from '@/domains/placement';
import { apiHandler, ok, created } from '@/domains/shared/http';

const params = z.object({ id: z.uuid() });

const sendMessageBody = z.object({
  content: z.string().trim().min(1).max(2000),
});

/**
 * GET /api/v1/applications/{id}/messages — list messages for an application.
 * First gate is the role list (everyone except VERIFIER, who holds no access
 * here); the service still does the three-way ownership check (staff with
 * `match_case:read`, the owning employer, or the applicant themself).
 */
export const GET = apiHandler({
  roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF', 'EMPLOYER', 'APPLICANT'],
  params,
  handler: async ({ actor, params: p }) => ok(await listMessages(actor!, p.id)),
});

/** POST /api/v1/applications/{id}/messages — send a message. */
export const POST = apiHandler({
  roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF', 'EMPLOYER', 'APPLICANT'],
  params,
  body: sendMessageBody,
  handler: async ({ ctx, actor, params: p, body }) =>
    created(await sendMessage({ ...ctx, actor: actor! }, p.id, body.content)),
});
