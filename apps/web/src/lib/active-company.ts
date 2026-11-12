/**
 * The employer's currently active company, kept in a cookie so the server can
 * resolve it when building the Actor (see domains/auth/actor.ts). The cookie
 * is only ever honoured for a company the user is a member of. Client-safe:
 * no server imports, so client components can use it too.
 */
export const ACTIVE_COMPANY_COOKIE = 'jb-active-company';

/** Session lifetime (7 days), matching SESSION_TTL_SECONDS. */
export const ACTIVE_COMPANY_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Makes `companyId` the employer's active company for later requests. */
export function setActiveCompanyCookie(companyId: string): void {
  document.cookie = `${ACTIVE_COMPANY_COOKIE}=${companyId}; path=/; max-age=${ACTIVE_COMPANY_MAX_AGE_SECONDS}; SameSite=Lax`;
}
