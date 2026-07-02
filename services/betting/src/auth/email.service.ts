import { Injectable, Logger } from '@nestjs/common';

/**
 * Delivers one-time codes. In production (RESEND_API_KEY set) it posts to
 * Resend; in local dev it logs the code to the console so there's no external
 * dependency. sendOtp never rethrows a delivery failure — the caller must not
 * be able to distinguish "sent" from "failed" (no account enumeration).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendOtp(email: string, code: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Local dev: no provider configured — surface the code on the console.
      console.log(`[dev] OTP for ${email}: ${code}`);
      return;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM ?? 'onboarding@resend.dev',
          to: [email],
          subject: 'Your code',
          html: `<p>Your Agent Arena verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
        }),
      });
      if (!response.ok) {
        this.logger.error(`OTP email rejected by Resend (status ${response.status})`);
      }
    } catch (error) {
      this.logger.error('OTP email delivery failed', error);
    }
  }
}
