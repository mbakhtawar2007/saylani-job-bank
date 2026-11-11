import 'server-only';
import { schema } from '@jobbank/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import { createNotifications, type CreateNotificationInput } from '@/domains/notifications';
import type { RequestContext } from '@/domains/shared/audit';
import { db, type DbExecutor } from '@/lib/db';
import { env } from '@/lib/env';
import { sendMail, type MailMessage } from '@/lib/mail/mailer';

const appUrl = (path: string) => new URL(path, env.NEXT_PUBLIC_APP_URL).toString();

/**
 * Emails the company's employer accounts (owner decision 14; M16 replaces this with the
 * notification system). Sent after the change committed; a mail failure is logged, never
 * undoes the change.
 *
 * Staff-created companies have no employer account yet, so there is no member to
 * email — verification, rejection and info-request mails silently went nowhere.
 * When no member exists, the mail goes to the company's primary contact (the
 * person the field visit met) instead, with a link to the site rather than the
 * employer dashboard they cannot open. Logged, so the fallback is visible.
 */
export async function emailEmployers(
  ctx: RequestContext,
  companyId: string,
  build: (input: { name: string; url: string }) => Omit<MailMessage, 'to'>,
): Promise<void> {
  const recipients = await db
    .select({ name: schema.users.name, email: schema.users.email })
    .from(schema.companyMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .where(eq(schema.companyMembers.companyId, companyId));
  if (recipients.length === 0) {
    const [contact] = await db
      .select({ name: schema.companyContacts.name, email: schema.companyContacts.email })
      .from(schema.companyContacts)
      .where(
        and(
          eq(schema.companyContacts.companyId, companyId),
          eq(schema.companyContacts.isPrimary, true),
          isNotNull(schema.companyContacts.email),
        ),
      )
      .limit(1);
    if (!contact?.email) {
      ctx.log.warn('company email skipped: no employer members and no primary contact email', {
        companyId,
      });
      return;
    }
    ctx.log.warn('company email fell back to primary contact: no employer members yet', {
      companyId,
    });
    try {
      await sendMail({
        to: contact.email,
        ...build({ name: contact.name, url: appUrl('/') }),
      });
    } catch (err) {
      ctx.log.error('company email failed', { companyId, err });
    }
    return;
  }
  for (const recipient of recipients) {
    try {
      await sendMail({
        to: recipient.email,
        ...build({ name: recipient.name, url: appUrl('/employer') }),
      });
    } catch (err) {
      ctx.log.error('company email failed', { companyId, err });
    }
  }
}

/**
 * Audit 2026-11-11 (M-15): the in-app counterpart of emailEmployers.
 * Verification outcomes went only by email, and the staff member who
 * onboarded the company got nothing at all. This notifies the employer
 * members plus the onboarder (from company_onboarding, when one exists),
 * deduplicated — a self-registered employer is already a member.
 * Best-effort like the emails: callers fire it post-commit and log failures.
 */
export async function notifyCompanyOutcome(
  executor: DbExecutor,
  companyId: string,
  build: (input: { userId: string }) => CreateNotificationInput | null,
): Promise<void> {
  const [members, [onboarding]] = await Promise.all([
    executor
      .select({ userId: schema.companyMembers.userId })
      .from(schema.companyMembers)
      .where(eq(schema.companyMembers.companyId, companyId)),
    executor
      .select({ onboardedBy: schema.companyOnboarding.onboardedBy })
      .from(schema.companyOnboarding)
      .where(eq(schema.companyOnboarding.companyId, companyId))
      .limit(1),
  ]);
  const userIds = new Set(members.map((member) => member.userId));
  if (onboarding?.onboardedBy) userIds.add(onboarding.onboardedBy);
  const payloads = [...userIds].flatMap((userId) => {
    const payload = build({ userId });
    return payload ? [payload] : [];
  });
  await createNotifications(executor, payloads);
}
