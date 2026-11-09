import 'server-only';
import { env } from '@/lib/env';
import { maskPhoneForLog } from './mask';

export interface SmsSender {
  send(to: string, message: string): Promise<void>;
}

/** Recent messages, kept only in tests so the test suites can read OTPs. Never populated in development or production. */
export const devOutbox: { to: string; message: string; at: Date }[] = [];

const consoleSender: SmsSender = {
  async send(to, message) {
    // Tests read OTPs from here; full OTP text is never retained outside a test run.
    if (process.env.NODE_ENV === 'test') {
      devOutbox.push({ to, message, at: new Date() });
      if (devOutbox.length > 50) devOutbox.shift();
    }
    if (process.env.NODE_ENV === 'development') {
      // Log only that a challenge was issued, never the message body or code.
      console.info(`📱 [dev SMS → ${maskPhoneForLog(to)}] challenge issued`);
    }
  },
};

export function getSmsSender(): SmsSender {
  if (env.SMS_PROVIDER === 'console') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SMS_PROVIDER=console cannot be used in production; configure a real SMS gateway',
      );
    }
    return consoleSender;
  }
  throw new Error(`Unsupported SMS_PROVIDER ${env.SMS_PROVIDER as string}`);
}
