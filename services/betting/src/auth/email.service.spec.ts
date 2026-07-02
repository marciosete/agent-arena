import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from './email.service';

const EMAIL = 'punter@example.com';
const CODE = '123456';
const RESEND_URL = 'https://api.resend.com/emails';

function okResponse(): Response {
  return { ok: true, status: 200 } as Response;
}

describe('EmailService', () => {
  let service: EmailService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new EmailService();
    fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
  });

  it('logs the code to the console and does not call fetch in local dev', async () => {
    delete process.env.RESEND_API_KEY;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await service.sendOtp(EMAIL, CODE);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain(CODE);
    expect(logSpy.mock.calls[0][0]).toContain(EMAIL);
  });

  it('posts to Resend with the api key and default from-address when configured', async () => {
    process.env.RESEND_API_KEY = 'resend-key';

    await service.sendOtp(EMAIL, CODE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(RESEND_URL);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer resend-key');
    const body = JSON.parse(init.body);
    expect(body.from).toBe('Agent Arena <onboarding@resend.dev>');
    expect(body.to).toEqual([EMAIL]);
    expect(body.subject).toContain(CODE);
    expect(body.html).toContain(CODE);
    expect(body.text).toContain(CODE);
  });

  it('uses RESEND_FROM when set', async () => {
    process.env.RESEND_API_KEY = 'resend-key';
    process.env.RESEND_FROM = 'arena@sportsbet.test';

    await service.sendOtp(EMAIL, CODE);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.from).toBe('arena@sportsbet.test');
  });

  it('never throws when Resend responds with a non-ok status', async () => {
    process.env.RESEND_API_KEY = 'resend-key';
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(service.sendOtp(EMAIL, CODE)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('never throws when the network call rejects', async () => {
    process.env.RESEND_API_KEY = 'resend-key';
    fetchMock.mockRejectedValue(new Error('network down'));
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(service.sendOtp(EMAIL, CODE)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
