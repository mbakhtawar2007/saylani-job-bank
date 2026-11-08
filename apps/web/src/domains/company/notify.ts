import 'server-only';
import { schema } from '@jobbank/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { RequestContext } from '@/domains/shared/audit';
import { db } from '@/lib/db';
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
