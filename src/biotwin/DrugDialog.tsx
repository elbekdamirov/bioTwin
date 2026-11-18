import { useMemo, useState } from 'react';
import { Droplets, Pill, Syringe, X } from 'lucide-react';
import type { SimSnapshot } from '@/sim/engine/snapshot';
import type { SimAction } from '@/sim/interventions/actions';
import { formLabel, shortDrugsFor, type Form, type ShortDrug } from './shortDrugs';
import type { Profile } from './model';

type Translate = (en: string, uz: string) => string;
const icons = { injection: Syringe, tablet: Pill, drip: Droplets } as const;

/** Pop-up: choose an injection, tablet or drip, set the dose, give it to twin B. */
export function DrugDialog({ profile, snapshot, t, uz, close, give, busy }: {
  profile: Profile; snapshot?: SimSnapshot; t: Translate; uz: boolean; busy: boolean;
  close: () => void; give: (action: SimAction, label: string) => void;
}) {
  const list = shortDrugsFor(profile.preset);
  const [form, setForm] = useState<Form | 'all'>('all');
  const [picked, setPicked] = useState<ShortDrug>(list[0]!);
  const [dose, setDose] = useState(list[0]!.dose);
  const shown = useMemo(() => list.filter(d => form === 'all' || d.form === form), [list, form]);
  const allergies = profile.drugAllergies.toLowerCase().split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
  const blocks = [...(picked.check?.(snapshot) ?? []),
    ...(allergies.some(a => picked.name.toLowerCase().includes(a)) ? [t('A matching drug allergy is recorded.', 'Mos dori allergiyasi qayd etilgan.')] : []),
    ...(snapshot ? [] : [t('No active twin yet.', 'Faol egizak yo‘q.')])];
  const choose = (d: ShortDrug) => { setPicked(d); setDose(d.dose); };
  const valid = dose >= picked.min && dose <= picked.max;
  return <dialog className="modal drug-dialog" aria-labelledby="drug-title" ref={n => { if (n && !n.open) n.showModal(); }} onCancel={e => { e.preventDefault(); close(); }}>
    <div className="modal-body">
      <div className="dd-head"><h2 id="drug-title">{t('Give a medicine', 'Dori berish')}</h2><button className="quiet" aria-label={t('Close', 'Yopish')} onClick={close}><X size={18} /></button></div>
      <p className="muted">{t('Pick an injection, tablet or drip, set the dose and give it to twin B. Twin A stays untreated so you can compare.', 'Ukol, tabletka yoki tomchini tanlang, dozani belgilang va B egizakka bering. A egizak taqqoslash uchun davolanmasdan qoladi.')}</p>
      <div className="dd-tabs" role="tablist">{(['all', 'injection', 'tablet', 'drip'] as const).map(f => <button key={f} role="tab" aria-selected={form === f} onClick={() => setForm(f)}>
        {f === 'all' ? t('All', 'Hammasi') : formLabel(f, uz)}</button>)}</div>
      <div className="dd-grid">
        <div className="dd-list">{shown.map(d => { const Icon = icons[d.form]; return <button key={d.id} aria-pressed={picked.id === d.id} onClick={() => choose(d)}>
          <Icon size={17} /><span><b>{uz ? d.uz : d.name}</b><small>{uz ? d.use[1] : d.use[0]}</small></span></button>; })}</div>
        <div className="dd-detail">
          <p className="eyebrow">{formLabel(picked.form, uz)} · {picked.route}</p>
          <h3>{uz ? picked.uz : picked.name}</h3>
          <p>{uz ? picked.effect[1] : picked.effect[0]}</p>
          <label className="dd-dose">{t('Dose', 'Doza')}
            <span><input type="number" min={picked.min} max={picked.max} step={picked.step} value={dose} onChange={e => setDose(Number(e.target.value))} /><b>{picked.unit}</b></span></label>
          <input type="range" aria-label={t('Dose slider', 'Doza slayderi')} min={picked.min} max={picked.max} step={picked.step} value={dose} onChange={e => setDose(Number(e.target.value))} />
          <p className="muted small">{t('Allowed range', 'Ruxsat etilgan oraliq')}: {picked.min}–{picked.max} {picked.unit}</p>
          {blocks.map(b => <p key={b} className="notice">⛔ {b}</p>)}
          <button className="primary wide" disabled={busy || !valid || blocks.length > 0} onClick={() => give(picked.build(dose, profile.weight), `${uz ? picked.uz : picked.name} ${dose} ${picked.unit}`)}>
            <Syringe size={16} />{t('Give to twin B', 'B egizakka berish')}</button>
        </div>
      </div>
    </div>
  </dialog>;
}
