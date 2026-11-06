import type { Role } from '@jobbank/shared';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../client';
import {
  accounts,
  branches,
  companyContacts,
  companyLocations,
  companyMembers,
  companies,
  twoFactors,
  userRoles,
  users,
} from '../schema';
import type { SeedStep } from '../scripts/seed';

/**
 * Local development data — NEVER seeded in production (see seed.ts).
 * These are throwaway test credentials for the local dev database only.
 *
 * The seed password has a single source of truth: the SEED_DEV_PASSWORD environment
 * variable (set it in .env — see .env.example — or in CI). It is deliberately read
 * lazily, at seed/sign-in time, not at import time: the seed script loads .env only
 * after importing this module, and test runners load it in their own setup files.
 * There is no hardcoded password anywhere in the repo: the previous value was
 * committed in this file, in test helpers and in git history, so treat it as
 * compromised — re-seed every dev/test database after rotating it.
 */
export function getSeedDevPassword(): string {
  const password = process.env.SEED_DEV_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error(
      'SEED_DEV_PASSWORD must be set to at least 10 characters ' +
        '(local dev seed only, never production). Add it to .env — see .env.example.',
    );
  }
  return password;
}

export const DEV_BRANCHES = [
  {
    code: 'KHI-GULSHAN',
    name: 'Karachi — Gulshan-e-Iqbal',
    city: 'Karachi',
    address: 'Block 13-D, Gulshan-e-Iqbal, Karachi',
    location: { lat: 24.9204, lng: 67.0932 },
  },
  {
    code: 'LHR-JOHAR',
    name: 'Lahore — Johar Town',
    city: 'Lahore',
    address: 'Block G1, Johar Town, Lahore',
    location: { lat: 31.4697, lng: 74.2728 },
  },
] as const;

type BranchCode = (typeof DEV_BRANCHES)[number]['code'];

interface DevUser {
  email: string;
  name: string;
  roles: { role: Role; branch?: BranchCode }[];
  phone?: string;
  password?: boolean;
  status?: 'ACTIVE' | 'DISABLED';
}

export const DEV_USERS: DevUser[] = [
  {
    email: 'superadmin@jobbank.local',
    name: 'Saima Super Admin',
    roles: [{ role: 'SUPER_ADMIN' }],
    password: true,
  },
  {
    email: 'branchadmin.khi@jobbank.local',
    name: 'Bilal Branch Admin',
    roles: [{ role: 'BRANCH_ADMIN', branch: 'KHI-GULSHAN' }],
    password: true,
  },
  {
    email: 'verifier.khi@jobbank.local',
    name: 'Ayesha Verifier',
    roles: [{ role: 'VERIFIER', branch: 'KHI-GULSHAN' }],
    password: true,
  },
  {
    email: 'staff.khi@jobbank.local',
    name: 'Sana Staff (Karachi)',
    roles: [{ role: 'STAFF', branch: 'KHI-GULSHAN' }],
    password: true,
  },
  {
    email: 'staff.lhr@jobbank.local',
    name: 'Usman Staff (Lahore)',
    roles: [{ role: 'STAFF', branch: 'LHR-JOHAR' }],
    password: true,
  },
  {
    email: 'employer@jobbank.local',
    name: 'Hamza Employer',
    roles: [{ role: 'EMPLOYER' }],
    password: true,
  },
  {
    email: 'disabled.staff@jobbank.local',
    name: 'Danish Disabled',
    roles: [{ role: 'STAFF', branch: 'KHI-GULSHAN' }],
    password: true,
    status: 'DISABLED',
  },
  // Applicants sign in with phone + SMS code (the code is printed in the dev server log).
  {
    email: '923001234567@phone.jobbank.invalid',
    name: 'Ahmed Applicant',
    phone: '+923001234567',
    roles: [{ role: 'APPLICANT' }],
  },
];

export const devData: SeedStep = {
  name: 'dev branches & users',
  async run(db: Database) {
    const passwordHash = await hashPassword(getSeedDevPassword());

    await db.transaction(async (tx) => {
      const branchIds = new Map<string, string>();
      for (const branch of DEV_BRANCHES) {
        const [row] = await tx
          .insert(branches)
          .values({ ...branch, location: { ...branch.location } })
          .onConflictDoUpdate({
            target: branches.code,
            set: { name: branch.name, city: branch.city, address: branch.address, isActive: true },
          })
          .returning({ id: branches.id });
        branchIds.set(branch.code, row!.id);
      }

      for (const user of DEV_USERS) {
        const [row] = await tx
          .insert(users)
          .values({
            email: user.email,
            name: user.name,
            emailVerified: Boolean(user.password),
            phoneNumber: user.phone ?? null,
            phoneNumberVerified: Boolean(user.phone),
            status: user.status ?? 'ACTIVE',
          })
          .onConflictDoUpdate({
            target: users.email,
            set: { name: user.name, status: user.status ?? 'ACTIVE', twoFactorEnabled: false },
          })
          .returning({ id: users.id });
        const userId = row!.id;

        // Clear any enrolled TOTP secret so the account starts without 2FA on every seed.
        await tx.delete(twoFactors).where(eq(twoFactors.userId, userId));

        if (user.password) {
          await tx
            .insert(accounts)
            .values({ userId, providerId: 'credential', accountId: userId, password: passwordHash })
            .onConflictDoUpdate({
              target: [accounts.providerId, accounts.accountId],
              set: { password: passwordHash },
            });
        }

        // Reset this user's roles to exactly what is declared above.
        await tx.delete(userRoles).where(eq(userRoles.userId, userId));
        await tx.insert(userRoles).values(
          user.roles.map(({ role, branch }) => ({
            userId,
            roleCode: role,
            branchId: branch ? branchIds.get(branch)! : null,
          })),
        );
      }

      // A pre-VERIFIED company for the seeded employer, so local testing can go
      // straight to posting jobs (PRD rule 2: only verified companies post).
      const [employer] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, 'employer@jobbank.local'));
      if (employer) {
        const companyId = '00000000-0000-4000-8000-00000000c001';
        await tx
          .insert(companies)
          .values({
            id: companyId,
            branchId: branchIds.get('KHI-GULSHAN')!,
            legalName: 'Hamza Traders (Pvt) Ltd',
            tradeName: 'Hamza Traders',
            legalStructure: 'PRIVATE_LIMITED',
            ntn: '1234567-8',
            industryCode: 'RETAIL',
            sizeBand: '1_10',
            website: 'https://hamzatraders.example',
            description: 'Dev-seeded verified company for local testing.',
            status: 'VERIFIED',
            verifiedAt: new Date(),
            createdBy: employer.id,
          })
          .onConflictDoNothing({ target: companies.id });
        await tx
          .insert(companyMembers)
          .values({ companyId, userId: employer.id, role: 'OWNER' })
          .onConflictDoNothing();
        await tx
          .insert(companyContacts)
          .values({
            companyId,
            name: 'Hamza Employer',
            designation: 'Owner',
            phone: '+923001112223',
            email: 'employer@jobbank.local',
            isPrimary: true,
          })
          .onConflictDoNothing();
        await tx
          .insert(companyLocations)
          .values({
            companyId,
            kind: 'HQ',
            label: 'Head office',
            addressLine: 'Block 13-D, Gulshan-e-Iqbal, Karachi',
            cityCode: 'KARACHI',
            areaCode: 'GULSHAN_E_IQBAL',
            location: { lat: 24.9204, lng: 67.0932 },
          })
          .onConflictDoNothing();
      }
    });
  },
};
