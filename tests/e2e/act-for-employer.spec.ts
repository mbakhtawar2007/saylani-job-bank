/* Ported from Najam (2026-11-11). Adaptations: job bodies use ROTATING +
 * shiftHours; no 'Schedule' button is expected on the referral page (interview
 * scheduling was removed end-to-end in this repo); the referred candidate's name
 * IS visible to the employer (2026-11-10 full-contact rule), not hidden. */
import { expect, test, type Page } from '@playwright/test';
import { referNewCandidate, REFERRED_CANDIDATE_NAME } from '../../apps/web/e2e-referral';

/** Shared dev credentials — see packages/db/src/seed/dev-data.ts. */
const DEV_PASSWORD = 'JobBank-Dev-2026!';
const HEADER = 'x-jb-on-behalf-of-company';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: /Staff \/ Admin/ }).click();
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Password/).fill(DEV_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe('staff acting for an employer', () => {
  test('staff run the employer screens for a company in their city', async ({ page }) => {
    await signIn(page, 'staff.khi@jobbank.local');

    await page.getByRole('link', { name: 'Employers' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Employers' })).toBeVisible();
    await page.getByRole('link', { name: /Hamza Traders/ }).click();
    await expect(page).toHaveURL(/\/staff\/employers\/[0-9a-f-]{36}$/);
    await expect(page.getByText('You are acting for')).toBeVisible();
    const consoleUrl = page.url();
    const companyId = consoleUrl.split('/').pop()!;

    await page.getByRole('link', { name: 'Post a job' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Post a new job' })).toBeVisible();

    const title = `Counter job ${Date.now()}`;
    const created = await page.request.post('/api/v1/jobs/me', {
      headers: { [HEADER]: companyId, origin: new URL(page.url()).origin },
      data: {
        title,
        categoryCode: 'CALL_CENTRE',
        description: 'A job posted by staff for an employer without a computer.',
        jobType: 'FULL_TIME',
        shift: 'ROTATING',
        shiftHours: 8,
        vacancies: 1,
      },
    });
    expect(created.status(), await created.text()).toBe(200);

    await page.goto(consoleUrl);
    await page.getByRole('link', { name: title }).click();
    await expect(page).toHaveURL(/\/staff\/employers\/.+\/jobs\/[0-9a-f-]{36}$/);
    await expect(page.getByText(title).first()).toBeVisible();
    const jobUrl = page.url();

    await page.goto(`${jobUrl}/edit`);
    await expect(page.getByLabel(/Job title/)).toHaveValue(title);
    await page.goto(`${jobUrl}/matches`);
    await expect(page.getByText('You are acting for')).toBeVisible();

    const referralId = await referNewCandidate((await created.json()).data.id);
    await page.goto(`${consoleUrl}/referrals/${referralId}`);
    await expect(page.getByText('You are acting for')).toBeVisible();
    // No Schedule button: employer-interview scheduling was removed end-to-end.
    // The referred candidate's name IS shown (2026-11-10 full-contact rule).
    await expect(page.getByText(REFERRED_CANDIDATE_NAME).first()).toBeVisible();
  });

  test('staff from another city cannot open the company', async ({ page, browser }) => {
    await signIn(page, 'staff.khi@jobbank.local');
    await page.goto('/staff/employers');
    await page.getByRole('link', { name: /Hamza Traders/ }).click();
    await expect(page).toHaveURL(/\/staff\/employers\/[0-9a-f-]{36}$/);
    const path = new URL(page.url()).pathname;

    const other = await browser.newContext({ baseURL: new URL(page.url()).origin });
    const otherPage = await other.newPage();
    await signIn(otherPage, 'staff.lhr@jobbank.local');
    await otherPage.goto('/staff/employers');
    await expect(otherPage.getByRole('link', { name: /Hamza Traders/ })).toHaveCount(0);
    await otherPage.goto(path);
    await expect(otherPage).toHaveURL(/\/forbidden/);
    await other.close();
  });

  test('the employer console is closed to employers', async ({ page }) => {
    await signIn(page, 'employer@jobbank.local');
    await page.goto('/staff/employers');
    await expect(page).toHaveURL(/\/forbidden/);
  });
});
