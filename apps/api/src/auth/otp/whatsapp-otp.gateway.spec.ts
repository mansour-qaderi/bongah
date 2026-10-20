import { WhatsAppOtpGateway } from './whatsapp-otp.gateway.js';
import type { WhatsAppSettings } from './otp.config.js';

const settings: WhatsAppSettings = {
  accessToken: 'secret-token',
  phoneNumberId: '555000111',
  templateName: 'bongah_verification_code',
  templateLanguage: 'fa',
  apiVersion: 'v21.0',
  baseUrl: 'https://graph.example.test',
  timeoutMs: 3000,
};

const reply = (status: number, json: unknown) => new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });

describe('WhatsAppOtpGateway', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the approved template with the code in the body and in the copy-code button', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { messages: [{ id: 'wamid.1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await new WhatsAppOtpGateway(settings).send('+93790049201', '123456');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.example.test/v21.0/555000111/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '93790049201', // digits only: no plus sign
      type: 'template',
      template: {
        name: 'bongah_verification_code',
        language: { code: 'fa' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: '123456' }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '123456' }] },
        ],
      },
    });
  });

  it('rejects when Meta refuses, and keeps the code and the token out of the error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(400, { error: { code: 131030, message: 'Recipient phone number not in allowed list' } })));
    const error = await new WhatsAppOtpGateway(settings).send('+93790049201', '654321').then(
      () => null,
      (e: Error) => e,
    );
    expect(error?.message).toBe('WhatsApp API answered HTTP 400');
    expect(error?.message).not.toContain('654321');
    expect(error?.message).not.toContain('secret-token');
  });

  it('rejects when the answer is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 })));
    await expect(new WhatsAppOtpGateway(settings).send('+93790049201', '111111')).rejects.toThrow('HTTP 502');
  });

  it('rejects when the API cannot be reached, without repeating what the network said', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(new WhatsAppOtpGateway(settings).send('+93790049201', '111111')).rejects.toThrow('could not be reached');
  });

  it('gives up after the timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' })));
    await expect(new WhatsAppOtpGateway(settings).send('+93790049201', '111111')).rejects.toThrow('within 3000 ms');
  });
});
