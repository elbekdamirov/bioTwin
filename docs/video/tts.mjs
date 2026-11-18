// Generates Uzbek narration clips with VoiceLab (same API/voice the app's tour uses).
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const env = fs.readFileSync('D:/Code/BioTwin-database-upgrade/.env', 'utf8');
const key = env.match(/VOICELAB_API_KEY=(.*)/)[1].trim();
const origin = 'https://api.voicelab.uz';
const auth = { Authorization: 'Bearer ' + key };
const get = async (u) => { const r = await fetch(origin + u, { headers: auth }); if (!r.ok) throw new Error(u + ' ' + r.status + ' ' + await r.text()); return r.json(); };
const catalog = await get('/v1/tts/languages');
let choice;
for (const m of catalog.models.filter(m => m.languages.includes('uz'))) {
  const voices = await get('/v1/voices?language=uz&model_id=' + encodeURIComponent(m.id));
  console.log('model', m.id, 'voices', voices.data.map(v => v.name ?? v.display_name).join(', '));
  const v = voices.data.find(v => /javohir/i.test(v.name ?? v.display_name ?? '')) ?? voices.data[0];
  if (v) { choice = { voice: v.id, model: m.id }; break; }
}
if (!choice) throw new Error('no uz voice');
const script = JSON.parse(fs.readFileSync(path.join(dir, 'script.json'), 'utf8'));
await Promise.all(script.map(async (s) => {
  const out = path.join(dir, s.id + '.wav');
  if (fs.existsSync(out)) return;
  let r = await fetch(origin + '/v1/tts', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: s.text, language: 'uz', voice_id: choice.voice, model_id: choice.model, speed: 1.0 }) });
  if (!r.ok) throw new Error(s.id + ' ' + r.status + ' ' + await r.text());
  let audio;
  if (r.status === 200 && (r.headers.get('content-type') ?? '').includes('audio')) audio = Buffer.from(await r.arrayBuffer());
  else {
    const job = await r.json();
    for (let i = 0; i < 90 && !audio; i++) {
      await new Promise(res => setTimeout(res, 2000));
      const j = await get('/v1/tts/generations/' + encodeURIComponent(job.id));
      if (j.status === 'failed') throw new Error(s.id + ' failed');
      if (j.status === 'completed') audio = Buffer.from(await (await fetch(j.audio_url)).arrayBuffer());
    }
  }
  fs.writeFileSync(out, audio);
  const sr = audio.readUInt32LE(24), bps = audio.readUInt32LE(28);
  console.log(s.id, 'bytes', audio.length, 'sec', ((audio.length - 44) / bps).toFixed(2), 'sr', sr);
}));
