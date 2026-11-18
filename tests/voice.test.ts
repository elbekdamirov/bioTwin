import { describe, expect, it, vi } from 'vitest';
import { createVoiceService, VoiceRequest } from '../server/voice';

const bytes = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(24)]);
const wav = () => new Response(bytes, { headers: { 'Content-Type': 'audio/wav' } });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const catalog = () => json({ models: [{ id: 'returned-model', languages: ['en', 'uz'] }] });
const voices = () => json({ data: [{ id: 'returned-voice', name: 'Claire Sterling' }, { id: 'velvet-voice', name: 'Dilnoza — Velvet' }] });
function service(fetcher: typeof fetch, timeout = 1000) {
  return createVoiceService({ key: () => 'test-only', fetcher, wait: async () => {}, timeout });
}

describe('VoiceLab guide adapter', () => {
  it('accepts only curated steps and languages and rejects custom text', () => {
    expect(VoiceRequest.safeParse({ step: 'welcome', language: 'uz' }).success).toBe(true);
    for (const body of [{ step: 'custom', language: 'en' }, { step: 'welcome', language: 'ru' }, { step: 'welcome', language: 'en', text: 'patient history' }]) {
      expect(VoiceRequest.safeParse(body).success).toBe(false);
    }
  });
  it('selects catalog values, relays WAV, caches and coalesces repeated requests', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(catalog()).mockResolvedValueOnce(voices()).mockResolvedValueOnce(wav());
    const adapter = service(fetcher);
    const [a,b] = await Promise.all([adapter.audio('en','welcome'), adapter.audio('en','welcome')]);
    expect(a).toEqual(bytes); expect(b).toEqual(a);
    await adapter.audio('en','welcome');
    expect(fetcher).toHaveBeenCalledTimes(3);
    const request = fetcher.mock.calls[2]![1]!;
    expect(JSON.parse(request.body as string)).toMatchObject({ voice_id: 'returned-voice', model_id: 'returned-model', language: 'en' });
    expect(new Headers(request.headers).get('Idempotency-Key')).toMatch(/^[a-f0-9-]{36}$/);
  });
  it('polls 202 jobs and retrieves signed audio without credentials', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(catalog()).mockResolvedValueOnce(voices())
      .mockResolvedValueOnce(json({ id: 'job-a' },202)).mockResolvedValueOnce(json({ id: 'job-a', status: 'processing' }))
      .mockResolvedValueOnce(json({ id: 'job-a', status: 'completed', audio_url: 'https://storage.voicelab.uz/example.wav' }))
      .mockResolvedValueOnce(wav());
    expect(await service(fetcher).audio('uz','welcome')).toEqual(bytes);
    expect(new Headers(fetcher.mock.calls.at(-1)![1]!.headers).has('Authorization')).toBe(false);
  });
  it.each([401,403,429,500])('handles provider HTTP %s without revealing body', async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ secret: 'never relay provider body' }, status));
    await expect(service(fetcher).audio('en','welcome')).rejects.toMatchObject({ status: status === 500 ? 502 : status });
  });
  it('handles timeout, failed job and invalid audio', async () => {
    const fetcher: typeof fetch = (_url, init) => new Promise((_resolve,reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted','AbortError'))));
    await expect(service(fetcher,5).audio('en','welcome')).rejects.toMatchObject({ status:504 });
    const failed = vi.fn<typeof fetch>().mockResolvedValueOnce(catalog()).mockResolvedValueOnce(voices())
      .mockResolvedValueOnce(json({id:'job'},202)).mockResolvedValueOnce(json({id:'job',status:'failed'}));
    await expect(service(failed).audio('en','welcome')).rejects.toMatchObject({status:502});
    const invalid = vi.fn<typeof fetch>().mockResolvedValueOnce(catalog()).mockResolvedValueOnce(voices()).mockResolvedValueOnce(json({audio:'wrong'}));
    await expect(service(invalid).audio('en','welcome')).rejects.toMatchObject({status:502});
  });
  it('reports missing configuration without a provider call', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(createVoiceService({key:()=>undefined,fetcher}).audio('en','welcome')).rejects.toMatchObject({status:503});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps captions when the requested voice is absent instead of selecting another narrator', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(catalog())
      .mockResolvedValueOnce(json({ data: [{ id: 'male-narrator', name: 'Other narrator' }] }));
    await expect(service(fetcher).audio('uz', 'welcome')).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

