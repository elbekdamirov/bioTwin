import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, Send, Sparkles, UserRound } from 'lucide-react';
import { answer, outcomeLabel, suggestions, type ChatAnswer, type Lang, type Organ } from './chat';
import type { ClinicalPatient } from './types';
import type { Plan } from './ForecastDashboard';

type Translate = (en: string, uz: string) => string;
type Message = { id: number; role: 'user' | 'bot'; text?: string; answer?: ChatAnswer; ai?: string };

let aiStatus: Promise<boolean> | null = null;
function aiAvailable() {
  aiStatus ??= fetch('/api/health').then(r => r.ok ? r.json() : { ai: false }).then((j: { ai?: boolean }) => !!j.ai).catch(() => false);
  return aiStatus;
}

export function ForecastChat({ patient, lang, t, applyPlan, onFocus, patientKey }: {
  patient: ClinicalPatient; lang: Lang; t: Translate; applyPlan: (p: Plan) => void; onFocus: (o: Organ) => void; patientKey: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const counter = useRef(0);

  useEffect(() => { setMessages([]); }, [patientKey]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  function ask(question: string) {
    const q = question.trim();
    if (!q) return;
    const reply = answer(q, patient, lang);
    const botId = ++counter.current;
    setMessages(m => [...m, { id: ++counter.current, role: 'user', text: q }, { id: botId, role: 'bot', answer: reply }]);
    setDraft('');
    const first = reply.runs[0]?.run;
    if (first && reply.kind === 'forecast') applyPlan({ add: first.added.map(d => d.id), remove: first.removed.map(d => d.id) });
    if (reply.focus) onFocus(reply.focus);
    if (reply.runs.length) void aiAvailable().then(ok => {
      if (!ok) return;
      return fetch('/api/ai/forecast', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, language: lang, facts: reply.text.slice(0, 40) }) })
        .then(r => r.ok ? r.json() : null).then((j: { reply?: string } | null) => {
          if (j?.reply) setMessages(m => m.map(x => x.id === botId ? { ...x, ai: j.reply } : x));
        });
    }).catch(() => undefined);
  }

  function submit(e: FormEvent) { e.preventDefault(); ask(draft); }

  return <div className="forecast-chat" data-tour="forecast">
    <div className="chat-head"><span className="bot-mark"><Bot size={17} /></span><div><h2>{t('Ask the twin', 'Egizakdan so‘rang')}</h2>
      <p className="muted">{t('5-year effect of a medicine on this patient’s body', 'Dorining bu bemor tanasiga 5 yillik ta’siri')}</p></div></div>
    <div className="chat-log" ref={list} aria-live="polite">
      <div className="msg bot"><Bot size={15} /><div>
        <p>{t(`I am the digital twin of ${patient.source.replace(/ · .*/, '')} patient (${patient.age} y, ${patient.sex === 'female' ? 'female' : 'male'}). Name a medicine and I will forecast what it does to the heart, brain, kidneys and metabolism over 5 years.`,
          `Men ${patient.source.replace(/ · .*/, '')} bemorining raqamli egizagiman (${patient.age} yosh, ${patient.sex === 'female' ? 'ayol' : 'erkak'}). Dori nomini yozing — uning yurak, miya, buyrak va moddalar almashinuviga 5 yillik ta’sirini hisoblayman.`)}</p>
        <p className="muted small">{t('English, O‘zbekcha and Русский drug names work.', 'Inglizcha, o‘zbekcha va ruscha dori nomlari ishlaydi.')}</p>
      </div></div>
      {messages.map(m => m.role === 'user'
        ? <div key={m.id} className="msg user"><UserRound size={15} /><p>{m.text}</p></div>
        : <div key={m.id} className="msg bot" data-kind={m.answer!.kind}><Bot size={15} /><div>
          {m.answer!.text.map((line, i) => <p key={i} className={line.startsWith('⛔') || line.startsWith('⚠') ? 'notice' : line.startsWith('—') ? 'run-title' : undefined}>{line}</p>)}
          {m.answer!.kind === 'compare' && <table className="compare-table"><thead><tr><th>{t('5-year risk', '5 yillik xavf')}</th><th>{t('No change', 'O‘zgarishsiz')}</th>
            {m.answer!.runs.map(r => <th key={r.label}>{r.label}</th>)}</tr></thead>
            <tbody>{m.answer!.runs[0]!.run.outcomes.map((o, i) => <tr key={o.id}><th>{outcomeLabel(o.id, lang)}</th><td>{(o.base.at(-1)! * 100).toFixed(1)}%</td>
              {m.answer!.runs.map(r => <td key={r.label}>{(r.run.outcomes[i]!.plan.at(-1)! * 100).toFixed(1)}%</td>)}</tr>)}</tbody></table>}
          {m.answer!.kind === 'compare' && <div className="chip-row">{m.answer!.runs.map(r => <button key={r.label} className="chip" onClick={() => applyPlan({ add: r.run.added.map(d => d.id), remove: [] })}>{t('Show', 'Ko‘rsatish')} {r.label}</button>)}</div>}
          {m.ai && <p className="ai-note"><Sparkles size={13} /> {m.ai}</p>}
          {m.answer!.followUps.length > 0 && <div className="chip-row">{m.answer!.followUps.map(f => <button key={f} className="chip" onClick={() => ask(f)}>{f}</button>)}</div>}
        </div></div>)}
    </div>
    {messages.length === 0 && <div className="chip-row starters">{suggestions(patient.condition, lang).map(s => <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>)}</div>}
    <form className="chat-input" onSubmit={submit}>
      <input aria-label={t('Ask about a medicine', 'Dori haqida so‘rang')} value={draft} onChange={e => setDraft(e.target.value)}
        placeholder={t('e.g. “Add empagliflozin” or “Compare semaglutide vs sitagliptin”', 'masalan: “Empagliflozin qo‘shing”')} maxLength={300} />
      <button className="primary" aria-label={t('Send', 'Yuborish')} disabled={!draft.trim()}><Send size={16} /></button>
    </form>
    <p className="muted small">{t('Answers are computed by the forecast model, not invented by AI. Research prototype — not medical advice.', 'Javoblar AI tomonidan to‘qilmaydi, prognoz modeli hisoblaydi. Tadqiqot prototipi — tibbiy maslahat emas.')}</p>
  </div>;
}
