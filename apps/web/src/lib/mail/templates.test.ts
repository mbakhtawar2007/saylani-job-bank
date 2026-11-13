import { describe, expect, it } from 'vitest';
import { employerCodeNoAccountEmail, signInCodeEmail } from './templates';

describe('employer sign-in code emails', () => {
  it('sends a code email with the code in the subject', () => {
    const mail = signInCodeEmail({ code: '123456', expiresMinutes: 5 });
    expect(mail.subject).toBe('123456 is your Saylani Job Bank sign-in code');
    expect(mail.text).toContain('123456');
  });

  it('tells a non-employer address there is no account, with a register link — and no code', () => {
    const mail = employerCodeNoAccountEmail({ url: 'https://jobbank.example/register' });
    expect(mail.subject).toBe('No employer account for this email address');
    expect(mail.text).toContain('no employer account');
    expect(mail.text).toContain('https://jobbank.example/register');
    expect(mail.text).not.toMatch(/\b\d{6}\b/);
  });
});
