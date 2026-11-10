import { describe, expect, it, vi } from 'vitest';

const { transaction, send } = vi.hoisted(() => ({ transaction: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { transaction } }));
vi.mock('@/lib/sms/sms', () => ({ getSmsSender: () => ({ send }) }));

const { generateOtpCode, hashOtp, issueOtp } = await import('./otp');

describe('OTP codes', () => {
  it('are 6 digits, zero-padded', () => {
    for (let i = 0; i < 200; i += 1) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });

  it('hash deterministically, bound to both phone and secret', () => {
    const secret = 'x'.repeat(40);
    const h = hashOtp('+923001234567', '123456', secret);
    expect(hashOtp('+923001234567', '123456', secret)).toBe(h);
    expect(hashOtp('+923331234567', '123456', secret)).not.toBe(h);
    expect(hashOtp('+923001234567', '123457', secret)).not.toBe(h);
    expect(hashOtp('+923001234567', '123456', 'y'.repeat(40))).not.toBe(h);
    expect(h).not.toContain('123456');
  });

  it('sends the code without logging the phone number or OTP', async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const insertValues = vi.fn().mockResolvedValue(undefined);
    transaction.mockImplementation(async (callback) =>
      callback({
        update: () => ({ set: () => ({ where: updateWhere }) }),
        insert: () => ({ values: insertValues }),
      }),
    );
    send.mockResolvedValue(undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await issueOtp('+923001234567', null);
      expect(send).toHaveBeenCalledWith('+923001234567', expect.stringMatching(/\b\d{6}\b/));
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
