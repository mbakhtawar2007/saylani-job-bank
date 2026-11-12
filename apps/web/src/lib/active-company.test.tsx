import { describe, expect, it } from 'vitest';
import { ACTIVE_COMPANY_COOKIE, setActiveCompanyCookie } from './active-company';

describe('setActiveCompanyCookie', () => {
  it('stores the active company under the cookie the server reads', () => {
    setActiveCompanyCookie('company-1');
    expect(document.cookie).toContain(`${ACTIVE_COMPANY_COOKIE}=company-1`);
  });
});
