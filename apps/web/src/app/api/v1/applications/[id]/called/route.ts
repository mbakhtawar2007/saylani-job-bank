import { z } from 'zod';
import { markCandidateCalled } from '@/domains/placement';
import { apiHandler, noContent } from '@/domains/shared/http';

/** POST /api/v1/applications/{id}/called — staff told a counter candidate about this status. */
export const POST = apiHandler({
  permission: 'match_case:manage',
  params: z.object({ id: z.uuid() }),
  handler: async ({ ctx, actor, params }) => {
    await markCandidateCalled({ ...ctx, actor: actor! }, params.id);
    return noContent();
  },
});
