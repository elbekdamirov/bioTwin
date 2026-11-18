import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { narrationVersion, tourSteps, type TourLanguage, type TourStepId } from '../src/biotwin/tour/scripts';

export const VoiceRequest = z.object({
  language: z.enum(['en', 'uz']),
  step: z.enum(tourSteps.map(step => step.id) as [TourStepId, ...TourStepId[]]),
}).strict();

export class VoiceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const origin = 'https://api.voicelab.uz';
const wavLimit = 8 * 1024 * 1024;
const catalogSchema = z.object({ models: z.array(z.object({ id: z.string(), languages: z.array(z.string()) })) });
const voicesSchema = z.object({ data: z.array(z.object({ id: z.string(), name: z.string().optional(), display_name: z.string().optional() })) });
const jobSchema = z.object({ id: z.string(), status: z.string().optional(), audio_url: z.string().optional() });
type Dependencies = { key: () => string | undefined; fetcher?: typeof fetch; wait?: (ms: number) => Promise<void>; timeout?: number };

export function createVoiceService(dependencies: Dependencies) {
  const fetcher = dependencies.fetcher ?? fetch;
  const wait = dependencies.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const choices = new Map<TourLanguage, { voice: string; model: string; until: number }>();
  const cached = new Map<string, Buffer>();
  const pending = new Map<string, Promise<Buffer>>();
  const attempts = new Map<string, { idempotency: string; job?: string; count: number }>();

  async function checked(url: string, init: RequestInit, authenticated = true) {
    const headers = new Headers(init.headers);
    if (authenticated) headers.set('Authorization', 'Bearer ' + dependencies.key());
    const result = await fetcher(url, { ...init, headers, redirect: 'error' });
    if (!result.ok) {
      const status = [401, 403, 429].includes(result.status) ? result.status : 502;
      throw new VoiceError(status, status === 429 ? 'Voice service is busy. Continue with captions.' :
        status === 401 || status === 403 ? 'VoiceLab authorization needs attention on the server.' : 'Voice service is unavailable. Continue with captions.');
    }
    return result;
  }
  async function wav(response: Response) {
    if (!response.headers.get('content-type')?.includes('audio/')) throw new VoiceError(502, 'Voice service returned an unsupported audio response.');
    if (Number(response.headers.get('content-length')) > wavLimit) throw new VoiceError(502, 'Audio exceeds the guide limit.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > wavLimit || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
      throw new VoiceError(502, 'Voice service returned invalid WAV audio.');
    }
    return bytes;
  }
  async function generate(language: TourLanguage, step: TourStepId): Promise<Buffer> {
    if (!dependencies.key()) throw new VoiceError(503, 'Set VOICELAB_API_KEY in the server .env to enable narration.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), dependencies.timeout ?? 75_000);
    const signal = controller.signal;
    try {
      let choice = choices.get(language);
      if (!choice || choice.until < Date.now()) {
        const catalog = catalogSchema.parse(await (await checked(origin + '/v1/tts/languages', { signal })).json());
        for (const model of catalog.models.filter(model => model.languages.includes(language))) {
          const voices = voicesSchema.parse(await (await checked(origin + '/v1/voices?language=' + language + '&model_id=' + encodeURIComponent(model.id), { signal })).json());
          const selected = language === 'en' ? voices.data[0] : voices.data.find(voice =>
            /dilnoza/i.test(voice.name ?? voice.display_name ?? '') &&
            /velvet/i.test(voice.name ?? voice.display_name ?? ''));
          if (selected) {
            choice = { voice: selected.id, model: model.id, until: Date.now() + 3600_000 };
            choices.set(language, choice);
            break;
          }
        }
      }
      if (!choice) throw new VoiceError(503, 'The preferred narrator is unavailable for this language. Continue with captions.');
      const key = [language, step, narrationVersion, choice.voice, choice.model].join('/');
      const existing = cached.get(key);
      if (existing) return existing;
      const attempt = attempts.get(key) ?? { idempotency: randomUUID(), count: 0 };
      if (attempt.count >= 3 && !attempt.job) throw new VoiceError(429, 'Narration retry limit reached. Continue with captions.');
      attempts.set(key, attempt);
      let audio: Buffer | undefined;
      if (!attempt.job) {
        attempt.count++;
        const response = await checked(origin + '/v1/tts', {
          method: 'POST', signal,
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.idempotency },
          body: JSON.stringify({ text: tourSteps.find(item => item.id === step)![language][1], language, voice_id: choice.voice, model_id: choice.model, speed: 1 }),
        });
        if (response.status === 200) audio = await wav(response);
        else if (response.status === 202) attempt.job = jobSchema.parse(await response.json()).id;
        else throw new VoiceError(502, 'Unsupported narration response.');
      }
      for (let poll = 0; !audio && poll < 18; poll++) {
        if (signal.aborted) throw new VoiceError(504, 'Narration timed out. Continue with captions.');
        const job = jobSchema.parse(await (await checked(origin + '/v1/tts/generations/' + encodeURIComponent(attempt.job!), { signal })).json());
        if (job.status === 'failed') throw new VoiceError(502, 'Narration generation failed. Continue with captions.');
        if (job.status === 'completed') {
          const url = new URL(job.audio_url!);
          // Only retrieve provider-issued public HTTPS audio. No credentials accompany this request.
          if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'localhost' ||
            /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) throw new VoiceError(502, 'Unsupported audio location.');
          audio = await wav(await checked(url.href, { signal }, false));
          break;
        }
        await wait(Math.min(1000 + poll * 400, 3000));
      }
      if (!audio) throw new VoiceError(504, 'Narration is still preparing. Replay this step later.');
      cached.set(key, audio);
      return audio;
    } catch (error) {
      if (error instanceof VoiceError) throw error;
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw new VoiceError(504, 'Narration timed out. Continue with captions.');
      throw new VoiceError(502, 'Voice service is unavailable. Continue with captions.');
    } finally { clearTimeout(timer); }
  }
  return {
    audio(language: TourLanguage, step: TourStepId) {
      const key = language + '/' + step;
      const existing = pending.get(key);
      if (existing) return existing;
      const promise = generate(language, step).finally(() => pending.delete(key));
      pending.set(key, promise);
      return promise;
    },
  };
}
export function voiceRouter(service = createVoiceService({ key: () => process.env.VOICELAB_API_KEY })) {
  const router = express.Router();
  const hits = new Map<string, number[]>();
  router.post('/audio', express.json({ limit: '1kb' }), async (req, res) => {
    const parsed = VoiceRequest.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Choose a supported tour step and language.' }); return; }
    const ip = req.ip ?? 'local';
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter(time => now - time < 60_000);
    if (recent.length >= 24) { res.status(429).json({ error: 'Please wait before replaying more narration.' }); return; }
    recent.push(now);
    if (hits.size > 1000) hits.clear();
    hits.set(ip, recent);
    try {
      const audio = await service.audio(parsed.data.language, parsed.data.step);
      res.set({ 'Content-Type': 'audio/wav', 'Cache-Control': 'private, max-age=3600' }).send(audio);
    } catch (error) {
      res.status(error instanceof VoiceError ? error.status : 502).json({ error: error instanceof VoiceError ? error.message : 'Narration unavailable.' });
    }
  });
  return router;
}

