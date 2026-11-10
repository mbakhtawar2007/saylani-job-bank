import { expect, test } from '@playwright/test';

/** Shared dev credentials — see packages/db/src/seed/dev-data.ts. */
const DEV_PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';
if (!DEV_PASSWORD)
  throw new Error(
    'SEED_DEV_PASSWORD must be set in .env (see .env.example) — local dev seed password, never production.',
  );

/** Seeded Branch Admin for the Karachi — Gulshan-e-Iqbal branch. */
const BRANCH_ADMIN_EMAIL = 'branchadmin.khi@jobbank.local';
/** Seeded Job Bank Staff — the lower-privilege role used for the isolation case. */
const STAFF_EMAIL = 'staff.khi@jobbank.local';

async function signIn(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: /Staff \/ Admin/ }).click();
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Password/).fill(DEV_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // Accepted credentials always leave /login. A BRANCH_ADMIN who has not enrolled an
  // authenticator yet is routed to /account/security?setup=required instead of /branch-admin
  // (requireSignedIn → TWO_FACTOR_REQUIRED_ROLES), so the exact landing is asserted per test.
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe('branch admin area (/branch-admin)', () => {
  test('the dashboard renders the welcome panel', async ({ page }) => {
    await signIn(page, BRANCH_ADMIN_EMAIL);

    await page.goto('/branch-admin');
    await expect(page).toHaveURL(/\/branch-admin$/);
    await expect(page.getByRole('heading', { level: 1, name: /Welcome back/ })).toBeVisible();
  });

  test('applicant creation and company management remain restricted', async ({ page }) => {
    await signIn(page, BRANCH_ADMIN_EMAIL);

    await page.goto('/branch-admin/applicants');
    await expect(page).toHaveURL(/\/branch-admin\/applicants$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Applicants' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Register job seeker' })).toHaveCount(0);

    await page.goto('/branch-admin/companies');
    await expect(page).toHaveURL(/\/branch-admin\/companies$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Companies' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add company' })).toHaveCount(0);

    await page.goto('/branch-admin/companies/new');
    await expect(page).toHaveURL(/\/forbidden/);

    await page.goto('/branch-admin/applicants/new');
    await expect(page).toHaveURL(/\/forbidden/);
  });

  test('jobs are read-only and settings and staff remain accessible', async ({ page }) => {
    await signIn(page, BRANCH_ADMIN_EMAIL);

    await page.goto('/branch-admin/jobs');
    await expect(page).toHaveURL(/\/branch-admin\/jobs$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Jobs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add job' })).toHaveCount(0);

    await page.goto('/branch-admin/jobs/new');
    await expect(page).toHaveURL(/\/forbidden/);

    await page.goto('/branch-admin/settings');
    await expect(page).toHaveURL(/\/branch-admin\/settings$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Branch settings' })).toBeVisible();

    await page.goto('/branch-admin/staff');
    await expect(page).toHaveURL(/\/branch-admin\/staff$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Staff' })).toBeVisible();
  });

  test('company status filtering is immediate and preserves search while resetting pagination', async ({
    page,
  }) => {
    await signIn(page, BRANCH_ADMIN_EMAIL);
    await page.goto('/branch-admin/companies?q=example&status=VERIFIED&page=2&pageSize=5');
    const status = page.getByLabel('Status');
    await expect(status.locator('option')).toHaveText([
      'Verified',
      'Suspended',
      'Under Review',
      'Info needed',
      'Rejected',
    ]);
    await expect(page.getByRole('button', { name: /Apply|Search/ })).toHaveCount(0);
    for (const value of [
      'SUSPENDED',
      'UNDER_VERIFICATION',
      'INFO_REQUESTED',
      'REJECTED',
      'VERIFIED',
    ]) {
      await status.selectOption(value);
      await expect(page).toHaveURL(new RegExp(`status=${value}`));
      const url = new URL(page.url());
      expect(url.searchParams.get('q')).toBe('example');
      expect(url.searchParams.get('pageSize')).toBe('5');
      expect(url.searchParams.has('page')).toBe(false);
    }
    await page.getByLabel('Search companies').fill('another search');
    await expect(page).toHaveURL(/q=another(\+|%20)search/);
    await expect(page.getByLabel('Status')).toHaveValue('VERIFIED');
    await page.getByLabel('Search companies').clear();
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(page.getByLabel('Status')).toHaveValue('VERIFIED');
  });

  test('job search and status update automatically together', async ({ page }) => {
    await signIn(page, BRANCH_ADMIN_EMAIL);
    await page.goto('/branch-admin/jobs?q=old&status=OPEN&page=2&pageSize=5&sort=title%3Aasc');
    await expect(page.getByRole('button', { name: 'Apply' })).toHaveCount(0);
    await page.getByLabel('Search jobs').fill('new search');
    await page.getByLabel('Status').selectOption('PAUSED');
    await expect(page).toHaveURL(/status=PAUSED/);
    const url = new URL(page.url());
    expect(url.searchParams.get('q')).toBe('new search');
    expect(url.searchParams.has('page')).toBe(false);
    expect(url.searchParams.get('pageSize')).toBe('5');
    expect(url.searchParams.get('sort')).toBe('title:asc');
    await page.getByLabel('Search jobs').fill('latest search');
    await expect(page).toHaveURL(/q=latest(\+|%20)search/);
    await expect(page.getByLabel('Status')).toHaveValue('PAUSED');
  });

  test('company jobs link to read-only detail and reject unrelated jobs', async ({ page }) => {
    await signIn(page, BRANCH_ADMIN_EMAIL);
    const company = '00000000-0000-4000-8000-00000000c002';
    const job = '00000000-0000-4000-8000-00000000d004';
    await page.goto(`/branch-admin/companies/${company}`);
    let link = page.getByRole('link', { name: 'Frontend Developer', exact: true });
    const row = link.locator('..');
    await link.scrollIntoViewIfNeeded();
    const box = await row.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width - 8, box!.y + box!.height / 2);
    await expect(page).toHaveURL(new RegExp(`/branch-admin/companies/${company}/${job}$`));
    await expect(page.getByRole('heading', { name: 'Frontend Developer' })).toBeVisible();
    for (const name of ['Edit', 'Add job', 'Archive', 'Publish', 'Pause', 'Resume']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    }
    for (const index of [0, 1]) {
      await page.goto(`/branch-admin/companies/${company}`);
      link = page.getByRole('link', { name: 'Frontend Developer', exact: true });
      await link.scrollIntoViewIfNeeded();
      const text = await link.locator('..').locator('p').nth(index).boundingBox();
      expect(text).not.toBeNull();
      await page.mouse.click(text!.x + text!.width / 2, text!.y + text!.height / 2);
      await expect(page).toHaveURL(new RegExp(`/branch-admin/companies/${company}/${job}$`));
    }
    await page.goto(`/branch-admin/companies/${company}`);
    link = page.getByRole('link', { name: 'Frontend Developer', exact: true });
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/branch-admin/companies/${company}/${job}$`));
    const mismatched = await page.goto(
      `/branch-admin/companies/${company}/00000000-0000-4000-8000-00000000d007`,
    );
    expect(mismatched?.status()).toBe(404);
    await page.goto(`/branch-admin/companies/${company}/00000000-0000-4000-8000-00000000d010`);
    await expect(page).toHaveURL(/\/forbidden$/);
  });

  test('signing out returns the admin to the login page', async ({ page }) => {
    await signIn(page, BRANCH_ADMIN_EMAIL);

    await page.getByRole('button', { name: /Account menu for/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Choose your role to continue:')).toBeVisible();
  });

  test('a staff member is refused the branch admin area', async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/staff$/);

    await page.goto('/branch-admin');
    await expect(page).toHaveURL(/\/forbidden/);
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  });
});
