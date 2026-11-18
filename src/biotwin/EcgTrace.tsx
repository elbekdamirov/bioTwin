import { useMemo } from 'react';
import { EcgGenerator, ecgParamsFrom } from '@/ui/monitor/waveforms';
import type { SimSnapshot } from '@/sim/engine/snapshot';

export function EcgTrace({ snapshot, label }: { snapshot: SimSnapshot; label: string }) {
  const path = useMemo(() => {
    const params = { ...ecgParamsFrom(snapshot), attached: true };
    const generator = new EcgGenerator();
    return Array.from({ length: 381 }, (_, x) => {
      const amplitude = generator.sample(1 / 125, params);
      return (x === 0 ? 'M' : 'L') + x + ' ' + (28 - Math.max(-1.1, Math.min(1.4, amplitude)) * 14).toFixed(2);
    }).join('');
  }, [snapshot]);
  return <figure className="ecg">
    <figcaption><span>{label}</span><b>{snapshot.phys.cv.hr.toFixed(0)} bpm</b></figcaption>
    <svg viewBox="0 0 380 47" role="img" aria-label={label + ' · ' + snapshot.phys.cv.rhythm}>
      <path d={path} fill="none" stroke="var(--teal)" strokeWidth="1.45" />
    </svg>
  </figure>;
}
