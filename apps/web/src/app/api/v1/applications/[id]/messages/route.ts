import { z } from 'zod';
import { listMessages, sendMessage } from '@/domains/placement';
import { ValidationError } from '@/domains/shared/errors';
import { apiHandler, ok, created } from '@/domains/shared/http';
import { parseListQuery } from '@/domains/shared/pagination';

const params = z.object({ id: z.uuid() });

const sendMessageBody = z.object({
  content: z.string().trim().min(1).max(2000),
});

// M32: message threads are paginated (20/page, oldest first).
const listOptions = {
  sortable: ['createdAt'] as const,
  defaultSort: { field: 'createdAt' as const, direction: 'asc' as const },
};

/**
 * GET /api/v1/applications/{id}/messages — list messages for an application.
 * First gate is the role list (everyone except VERIFIER, who holds no access
 * here); the service still does the three-way ownership check (staff with
 * `match_case:read`, the owning employer, or the applicant themself).
 */
export const GET = apiHandler({
  roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF', 'EMPLOYER', 'APPLICANT'],
  onBehalfOfEmployer: true,
  params,
  handler: async ({ actor, params: p, request }) => {
    let query;
    try {
      query = parseListQuery(new URL(request.url).searchParams, listOptions);
    } catch (error) {
      // A hand-edited URL with bad params falls back to the default view.
      if (!(error instanceof ValidationError)) throw error;
      query = parseListQuery(new URLSearchParams(), listOptions);
    }
    const { items, pagination } = await listMessages(actor!, p.id, query);
    return ok(items, pagination);
  },
});

/** POST /api/v1/applications/{id}/messages — send a message. */
export const POST = apiHandler({
  roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF', 'EMPLOYER', 'APPLICANT'],
  onBehalfOfEmployer: true,
  params,
  body: sendMessageBody,
  handler: async ({ ctx, actor, params: p, body }) =>
    created(await sendMessage({ ...ctx, actor: actor! }, p.id, body.content)),
});
