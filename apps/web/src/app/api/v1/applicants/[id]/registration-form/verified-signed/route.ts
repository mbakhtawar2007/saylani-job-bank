import { z } from 'zod';
import { markApplicantRegistrationVerifiedSigned } from '@/domains/applicant';
import { apiHandler, ok } from '@/domains/shared/http';

const params = z.object({ id: z.uuid() });

/** POST /api/v1/applicants/{id}/registration-form/verified-signed */
export const POST = apiHandler({
  permission: 'applicant:manage',
  params,
  handler: async ({ ctx, actor, params: p }) => {
    const marked = await markApplicantRegistrationVerifiedSigned({ ...ctx, actor: actor! }, p.id);
    return ok({
      verifiedSigned: true,
      verifiedSignedAt: marked.verifiedSignedAt.toISOString(),
      verifiedSignedBy: marked.verifiedSignedBy,
    });
  },
});
