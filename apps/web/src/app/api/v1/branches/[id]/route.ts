import { z } from 'zod';
import {
  deleteBranch,
  deleteBranchSchema,
  getBranch,
  updateBranch,
  updateBranchSchema,
} from '@/domains/branch';
import { apiHandler, noContent, ok } from '@/domains/shared/http';

const params = z.object({ id: z.uuid() });

/** GET /api/v1/branches/{id} — 403 (and an audit row) for branches outside the caller's scope. */
export const GET = apiHandler({
  permission: 'branch:read',
  params,
  handler: async ({ actor, params: p }) => ok(await getBranch(actor!, p.id)),
});

/** PATCH /api/v1/branches/{id} — Super Admin edits or (de)activates a branch. */
export const PATCH = apiHandler({
  permission: 'branch:manage',
  params,
  body: updateBranchSchema,
  handler: async ({ ctx, actor, params: p, body }) =>
    ok(await updateBranch({ ...ctx, actor: actor! }, p.id, body)),
});

/** DELETE /api/v1/branches/{id} — Super Admin deletes an already-deactivated branch, 90 days after its deactivation. */
export const DELETE = apiHandler({
  permission: 'branch:manage',
  params,
  body: deleteBranchSchema,
  handler: async ({ ctx, actor, params: p, body }) => {
    await deleteBranch({ ...ctx, actor: actor! }, p.id, body.reason);
    return noContent();
  },
});
