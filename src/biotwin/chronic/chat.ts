// Offline forecast assistant. It never invents numbers: every figure in an answer comes from forecast().
import { DRUGS, findDrugs, type Drug } from './drugs';
import { forecast, type ForecastRun, type OutcomeId } from './engine';
import type { ClinicalPatient } from './types';

export type Lang = 'en' | 'uz';
export type Organ = 'heart' | 'brain' | 'kidneys' | 'eyes' | 'metabolism' | 'vessels';
export type ChatAnswer = {
  kind: 'forecast' | 'compare' | 'adverse' | 'help' | 'unknown' | 'missing';
  text: string[];
  runs: { label: string; run: ForecastRun }[];
  drugs: Drug[];
  focus?: Organ;
  followUps: string[];
};

const tr = (lang: Lang, en: string, uz: string) => lang === 'uz' ? uz : en;
const pct = (x: number, lang: Lang) => (x * 100).toLocaleString(lang === 'uz' ? 'uz-Latn-UZ' : 'en', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

export const outcomeLabel = (id: OutcomeId | 'microvascular', lang: Lang) => ({
  chd: tr(lang, 'Heart attack or coronary death', 'Infarkt yoki koronar o‘lim'),
  stroke: tr(lang, 'Stroke', 'Insult'),
  cvd: tr(lang, 'First cardiovascular event', 'Birinchi yurak-qon tomir hodisasi'),
  kidney: tr(lang, 'Kidney failure (dialysis or transplant)', 'Buyrak yetishmovchiligi (dializ yoki transplant)'),
  death: tr(lang, 'Death from any cause', 'Har qanday sababdan o‘lim'),
  hfHosp: tr(lang, 'Hospital admission for heart failure', 'Yurak yetishmovchiligi bilan kasalxonaga yotish'),
  microvascular: tr(lang, 'Eye, kidney and nerve damage (microvascular)', 'Ko‘z, buyrak va nerv shikastlanishi (mikrovaskulyar)'),
})[id];

const ORGAN_WORDS: [Organ, RegExp][] = [
  ['heart', /heart|cardiac|infarct|attack|yurak|infarkt|сердц|инфаркт/i],
  ['kidneys', /kidney|renal|egfr|dialys|buyrak|почк/i],
  ['eyes', /eye|retin|vision|ko‘z|ko'z|глаз|ретин/i],
  ['brain', /stroke|brain|insult|miya|инсульт|мозг/i],
  ['metabolism', /sugar|glucose|hba1c|weight|vazn|qand|glyukoza|сахар|вес/i],
];

const has = (text: string, re: RegExp) => re.test(text);
const COMPARE = /\bvs\.?(?=\s|$)|versus|compare|comparison|which is better|\bor\b|taqqosla|\byoki\b|qaysi|сравн|(?:^|\s)или(?:\s|$)|лучше/i;
const COMBINE = /\b(add|plus|together|combined|both)\b|qo‘sh|qo'sh|birga|добав|вместе/i;
const STOP = /\bstop|discontinue|remove|without|quit|to‘xtat|to'xtat|olib tashla|bekor|отмен|прекрат|убрать|без\b/i;
const ADVERSE = /side effect|adverse|safe|risk of taking|harm|nojo‘ya|nojo'ya|xavfsiz|zarar|побоч|безопас/i;
const BASELINE = /no change|current|nothing|without treatment|as is|natural|hozirgi|o‘zgarishsiz|o'zgarishsiz|davolanmasa|текущ|без изменений/i;
const HELP = /^(hi|hello|help|salom|yordam|привет|помощь)\b|what can you/i;

export function suggestions(condition: ClinicalPatient['condition'], lang: Lang): string[] {
  const s = {
    t2d: [tr(lang, 'What happens in 5 years with no change?', '5 yilda hech narsa o‘zgarmasa nima bo‘ladi?'),
      tr(lang, 'Add empagliflozin', 'Empagliflozin qo‘shing'), tr(lang, 'Compare semaglutide vs sitagliptin', 'Semaglutid va sitagliptinni taqqoslang'),
      tr(lang, 'How will atorvastatin 80 affect the heart?', 'Atorvastatin 80 yurakka qanday ta’sir qiladi?'), tr(lang, 'Side effects of finerenone', 'Finerenonning nojo‘ya ta’sirlari')],
    t1d: [tr(lang, 'What happens in 5 years with no change?', '5 yilda hech narsa o‘zgarmasa nima bo‘ladi?'),
      tr(lang, 'Intensify insulin', 'Insulinni kuchaytiring'), tr(lang, 'Add atorvastatin 20 and ramipril', 'Atorvastatin 20 va ramipril qo‘shing')],
    hf: [tr(lang, 'What happens in 5 years with no change?', '5 yilda hech narsa o‘zgarmasa nima bo‘ladi?'),
      tr(lang, 'Add bisoprolol', 'Bisoprolol qo‘shing'), tr(lang, 'Add sacubitril/valsartan, spironolactone and dapagliflozin', 'Sakubitril/valsartan, spironolakton va dapagliflozin qo‘shing'),
      tr(lang, 'Compare dapagliflozin vs empagliflozin', 'Dapagliflozin va empagliflozinni taqqoslang')],
  }[condition];
  return s;
}

function describeRun(run: ForecastRun, lang: Lang, focus?: Organ): string[] {
  const lines: string[] = [];
  const outcomes = focus ? run.outcomes.filter(o => organOf(o.id) === focus).concat(run.outcomes.filter(o => organOf(o.id) !== focus)) : run.outcomes;
  for (const o of outcomes) {
    const base = o.base.at(-1)!, plan = o.plan.at(-1)!;
    if (!run.added.length && !run.removed.length) { lines.push(`${outcomeLabel(o.id, lang)}: ${pct(base, lang)} (${o.model})`); continue; }
    const diff = plan - base;
    const nnt = Math.abs(diff) > 0.001 ? Math.round(1 / Math.abs(diff)) : null;
    const change = diff < 0
      ? tr(lang, `${pct(-diff, lang)} lower${nnt ? ` — about 1 in ${nnt} patients avoids this event` : ''}`, `${pct(-diff, lang)} kamroq${nnt ? ` — taxminan ${nnt} bemordan 1 tasi bu hodisadan saqlanadi` : ''}`)
      : diff > 0 ? tr(lang, `${pct(diff, lang)} higher`, `${pct(diff, lang)} ko‘proq`) : tr(lang, 'no change', 'o‘zgarishsiz');
    lines.push(`${outcomeLabel(o.id, lang)} (${o.model}): ${pct(base, lang)} → ${pct(plan, lang)} [95% ${tr(lang, 'interval', 'oraliq')} ${pct(o.planLo, lang)}–${pct(o.planHi, lang)}]; ${change}.`);
  }
  for (const r of run.relative) lines.push(relativeLine(r, lang));
  const first = run.trajectory[0]!, y1 = run.trajectory[4]!, y5 = run.trajectory.at(-1)!;
  const markers: string[] = [];
  const fmt = (v: number | null, d = 1) => v === null ? '—' : v.toFixed(d);
  if (first.base.hba1c !== null) markers.push(`HbA1c ${fmt(first.base.hba1c)}% → ${tr(lang, 'year 5', '5-yil')}: ${fmt(y5.base.hba1c)}% ${tr(lang, 'without change', 'o‘zgarishsiz')}, ${fmt(y5.plan.hba1c)}% ${tr(lang, 'with plan', 'reja bilan')}`);
  if (Math.abs(y5.plan.weight - y5.base.weight) >= 0.5) markers.push(`${tr(lang, 'Weight', 'Vazn')} ${y5.plan.weight - y5.base.weight > 0 ? '+' : ''}${(y5.plan.weight - y5.base.weight).toFixed(1)} kg`);
  if (first.base.sbp !== null && Math.abs((y1.plan.sbp ?? 0) - (y1.base.sbp ?? 0)) >= 1) markers.push(`${tr(lang, 'Systolic BP', 'Sistolik bosim')} ${((y1.plan.sbp ?? 0) - (y1.base.sbp ?? 0)).toFixed(0)} mmHg`);
  if (first.base.ldl !== null && Math.abs((y1.plan.ldl ?? 0) - (y1.base.ldl ?? 0)) >= 0.1) markers.push(`LDL ${fmt(y1.base.ldl)} → ${fmt(y1.plan.ldl)} mmol/L`);
  if (first.base.egfr !== null) markers.push(`eGFR ${tr(lang, 'year 5', '5-yil')}: ${fmt(y5.base.egfr, 0)} → ${fmt(y5.plan.egfr, 0)} mL/min/1.73 m²`);
  if (first.base.ef !== null && Math.abs((y5.plan.ef ?? 0) - (y5.base.ef ?? 0)) >= 1) markers.push(`${tr(lang, 'Ejection fraction', 'Chiqarish fraksiyasi')} ${fmt(y5.base.ef, 0)}% → ${fmt(y5.plan.ef, 0)}%`);
  if (markers.length) lines.push(tr(lang, 'Body markers: ', 'Tana ko‘rsatkichlari: ') + markers.join(' · ') + '.');
  return lines;
}

export function relativeLine(r: ForecastRun['relative'][number], lang: Lang) {
  const lower = r.rr <= 1;
  const size = (x: number) => Math.abs(Math.round((1 - x) * 100));
  const [a, b] = lower ? [size(r.hi), size(r.lo)] : [size(r.lo), size(r.hi)];
  const range = r.lo < 1 && r.hi > 1
    ? tr(lang, `95% range: ${size(r.lo)}% lower to ${size(r.hi)}% higher — not clearly different`, `95% oraliq: ${size(r.lo)}% kamroqdan ${size(r.hi)}% ko‘proqgacha — aniq farq yo‘q`)
    : `${tr(lang, '95% range', '95% oraliq')} ${Math.min(a, b)}–${Math.max(a, b)}%`;
  const what = lower ? tr(lang, `${size(r.rr)}% lower relative risk`, `nisbiy xavf ${size(r.rr)}% kamroq`) : tr(lang, `${size(r.rr)}% higher relative risk`, `nisbiy xavf ${size(r.rr)}% ko‘proq`);
  const basis = r.hba1cDiff !== undefined
    ? tr(lang, `${r.sources}: 37% lower risk per 1% lower HbA1c; mean HbA1c difference ${r.hba1cDiff.toFixed(2)}%`, `${r.sources}: HbA1c 1% pasaysa xavf 37% kamayadi; o‘rtacha HbA1c farqi ${r.hba1cDiff.toFixed(2)}%`)
    : tr(lang, `trial: ${r.sources}`, `klinik sinov: ${r.sources}`);
  return `${outcomeLabel(r.id, lang)}: ${what} (${range}) — ${basis}.`;
}

export function organOf(id: OutcomeId | 'microvascular'): Organ {
  return ({ chd: 'heart', cvd: 'heart', death: 'heart', hfHosp: 'heart', stroke: 'brain', kidney: 'kidneys', microvascular: 'eyes' } as const)[id];
}

function warnings(run: ForecastRun, lang: Lang) {
  const out: string[] = [];
  for (const c of run.checks) {
    for (const s of c.stop) out.push(`⛔ ${c.drug.name}: ${s} ${tr(lang, 'Not applied in the forecast.', 'Prognozda qo‘llanmadi.')}`);
    for (const w of c.warn) out.push(`⚠ ${c.drug.name}: ${w}`);
  }
  for (const d of run.added) out.push(`${tr(lang, 'Watch for', 'Kuzating')} (${d.name}): ${(lang === 'uz' ? d.adverseUz : d.adverse).join('; ')}.`);
  return out;
}

/** Uzbek questions get Uzbek answers even when the interface is in English. */
export const looksUzbek = (q: string) => /(qo[‘'`ʻ]?sh|nima|bo[‘'`ʻ]?ladi|\byil(da|lik|dan)?\b|taqqosla|\bva\b|yurak|buyrak|nojo|xavf|qanday|kerak|\bdori)/i.test(q);

export function answer(question: string, p: ClinicalPatient, uiLang: Lang): ChatAnswer {
  const q = question.trim();
  const lang: Lang = looksUzbek(q) ? 'uz' : uiLang;
  const focus = ORGAN_WORDS.find(([, re]) => re.test(q))?.[0];
  const drugs = findDrugs(q, p.condition);
  const empty = (kind: ChatAnswer['kind'], text: string[]): ChatAnswer => ({ kind, text, runs: [], drugs, followUps: suggestions(p.condition, lang).slice(0, 3) });
  const base = forecast(p);
  if (base.missing.length) return empty('missing', [tr(lang,
    `I need a few more measurements before forecasting: ${base.missing.join(', ')}. Add them in "Patient data".`,
    `Prognoz uchun yana bir nechta o‘lchov kerak: ${base.missing.join(', ')}. Ularni "Bemor ma’lumotlari" bo‘limiga kiriting.`)]);

  if (has(q, HELP) && !drugs.length) return empty('help', [tr(lang,
    'Ask me what a medicine will do to this patient over 5 years. I run the digital twin with validated risk equations and trial results, then show heart, brain, kidney and metabolic effects.',
    'Dori bu bemorga 5 yil davomida qanday ta’sir qilishini so‘rang. Men raqamli egizakni tasdiqlangan xavf tenglamalari va klinik sinov natijalari bilan ishga tushiraman.')]);

  if (!drugs.length) {
    const otherCondition = DRUGS.find(d => d.aliases.some(a => q.toLowerCase().includes(a)));
    if (otherCondition && !has(q, BASELINE)) return empty('unknown', [tr(lang,
      `${otherCondition.name} has no validated effect model for this condition in BioTwin. Available here: ${DRUGS.filter(d => d.conditions.includes(p.condition)).map(d => d.name).join(', ')}.`,
      `BioTwin’da ${otherCondition.name} uchun bu kasallikda tasdiqlangan ta’sir modeli yo‘q. Mavjud dorilar: ${DRUGS.filter(d => d.conditions.includes(p.condition)).map(d => d.name).join(', ')}.`)]);
    if (!has(q, BASELINE) && !/5|year|yil|forecast|prognoz|прогноз|future|kelajak|будущ|risk|xavf|риск/i.test(q)) return empty('unknown', [tr(lang,
      'I did not recognise a medicine in that question. Try a name such as ' + suggestions(p.condition, 'en')[1] + ', or ask about the next 5 years with no change.',
      'Savolda dori nomini topmadim. Masalan: ' + suggestions(p.condition, 'uz')[1] + ' yoki o‘zgarishsiz 5 yilni so‘rang.')]);
    const current = p.meds.length ? p.meds.join(', ') : tr(lang, 'no recorded medicines', 'qayd etilgan dori yo‘q');
    return { kind: 'forecast', drugs: [], focus, runs: [{ label: tr(lang, 'No change', 'O‘zgarishsiz'), run: base }],
      text: [tr(lang, `5-year outlook if treatment stays the same (${current}):`, `Davolash o‘zgarmasa 5 yillik prognoz (${current}):`), ...describeRun(base, lang, focus)],
      followUps: suggestions(p.condition, lang).slice(1, 4) };
  }

  if (has(q, ADVERSE) && !has(q, /5|year|yil|forecast|prognoz/i)) {
    return { kind: 'adverse', drugs, focus, runs: [], followUps: drugs.map(d => tr(lang, `Add ${d.name.toLowerCase()}`, `${d.name} qo‘shing`)).slice(0, 2),
      text: drugs.flatMap(d => {
        const c = d.check(p, p.meds);
        return [`${d.name} (${d.drugClass}, ${d.dose}):`, ...(lang === 'uz' ? d.adverseUz : d.adverse).map(x => '• ' + x),
          ...c.stop.map(s => '⛔ ' + s), ...c.warn.map(w => '⚠ ' + w)];
      }) };
  }

  if (drugs.length >= 2 && has(q, COMPARE) && !has(q, COMBINE)) {
    const runs = drugs.slice(0, 3).map(d => ({ label: d.name, run: forecast(p, [d.id]) }));
    const text = [tr(lang, 'Side-by-side 5-year forecast for the same patient:', 'Bir bemor uchun 5 yillik prognoz yonma-yon:')];
    for (const { label, run } of runs) text.push('— ' + label + ':', ...describeRun(run, lang, focus));
    const key = runs[0]!.run.outcomes[0];
    if (key) {
      const best = [...runs].sort((a, b) => a.run.outcomes[0]!.plan.at(-1)! - b.run.outcomes[0]!.plan.at(-1)!)[0]!;
      text.push(tr(lang, `Lowest 5-year ${outcomeLabel(key.id, lang).toLowerCase()} risk: ${best.label}. Weigh this against side effects, cost and patient preference.`,
        `5 yillik eng past "${outcomeLabel(key.id, lang).toLowerCase()}" xavfi: ${best.label}. Buni nojo‘ya ta’sirlar, narx va bemor istagi bilan solishtiring.`));
    }
    return { kind: 'compare', drugs, focus, runs, text, followUps: runs.map(r => tr(lang, `Side effects of ${r.label.toLowerCase()}`, `${r.label} nojo‘ya ta’sirlari`)) };
  }

  const stopping = has(q, STOP);
  const remove = stopping ? drugs.filter(d => p.meds.includes(d.id)).map(d => d.id) : [];
  const add = stopping ? [] : drugs.map(d => d.id);
  const run = forecast(p, add, remove);
  const already = drugs.filter(d => p.meds.includes(d.id) && !stopping);
  const text: string[] = [];
  if (already.length) text.push(tr(lang, `Already taking: ${already.map(d => d.name).join(', ')} — its effect is part of the baseline.`, `Allaqachon qabul qilmoqda: ${already.map(d => d.name).join(', ')} — ta’siri boshlang‘ich holatda hisobga olingan.`));
  if (stopping && !remove.length) text.push(tr(lang, 'That medicine is not on the current list, so there is nothing to stop.', 'Bu dori joriy ro‘yxatda yo‘q, to‘xtatadigan narsa yo‘q.'));
  const names = [...run.added.map(d => '+ ' + d.name), ...run.removed.map(d => '− ' + d.name)].join(', ');
  if (names) text.push(tr(lang, `5-year forecast with ${names} (compared with no change):`, `${names} bilan 5 yillik prognoz (o‘zgarishsiz holatga nisbatan):`), ...describeRun(run, lang, focus));
  else if (!text.length) text.push(tr(lang, 'No change to the plan was applied.', 'Rejaga o‘zgarish kiritilmadi.'));
  text.push(...warnings(run, lang));
  return { kind: 'forecast', drugs, focus: focus ?? run.added[0]?.organs[0], runs: names ? [{ label: names, run }] : [], text,
    followUps: [...run.added.map(d => tr(lang, `Side effects of ${d.name.toLowerCase()}`, `${d.name} nojo‘ya ta’sirlari`)),
      ...suggestions(p.condition, lang).slice(1).filter(x => x.toLowerCase() !== q.toLowerCase() && !findDrugs(x, p.condition).some(d => run.added.includes(d)))].slice(0, 3) };
}
