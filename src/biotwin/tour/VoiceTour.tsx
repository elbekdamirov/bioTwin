import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { narrationVersion, tourSteps, type TourLanguage } from './scripts';

export const tourStorageKey = 'biotwin-tour-v1';
export function firstVisit() {
  try { return localStorage.getItem(tourStorageKey) === null; } catch { return true; }
}
type Props = { language: TourLanguage; setLanguage: (language: TourLanguage) => void; inStudio: boolean; close: () => void };

export function VoiceTour({ language, setLanguage, inStudio, close }: Props) {
  const t = (en: string, uz: string) => language === 'en' ? en : uz;
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [sound, setSound] = useState(true);
  const [volume, setVolume] = useState(.8);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [again, setAgain] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const panel = useRef<HTMLElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<string, string>());
  const returnFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const step = tourSteps[index]!;
  const blocked = step.studio && !inStudio;
  const [title, caption] = step[language];

  function dismiss() {
    try { localStorage.setItem(tourStorageKey, index === tourSteps.length - 1 ? 'completed' : 'dismissed'); } catch { /* in memory */ }
    close();
  }

  useEffect(() => {
    const restore = returnFocus.current;
    const cachedUrls = urls.current;
    panel.current?.focus();
    return () => {
      audio.current?.pause();
      for (const url of cachedUrls.values()) URL.revokeObjectURL(url);
      restore?.focus();
    };
  }, []);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  });

  useLayoutEffect(() => {
    const anchor = blocked ? 'patients' : step.anchor === 'patients' && inStudio ? 'navigation' :
      step.anchor === 'welcome' && inStudio ? 'stage' : step.anchor;
    const target = document.querySelector<HTMLElement>('[data-tour="' + anchor + '"]');
    const refresh = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      setRect(target?.getBoundingClientRect() ?? null);
    };
    target?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    refresh();
    const observer = new ResizeObserver(refresh);
    if (target) observer.observe(target);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [step, inStudio, blocked]);

  useEffect(() => {
    audio.current?.pause();
    audio.current = null;
    const controller = new AbortController();
    let current: HTMLAudioElement | null = null;
    const key = narrationVersion + '/' + language + '/' + step.id;
    let live = true;
    void (async () => {
      setPlaying(false);
      setLoading(false);
      if (!started || !sound || blocked) return;
      setLoading(true);
      setMessage('');
      try {
        let url = urls.current.get(key);
        if (!url) {
          const timeout = window.setTimeout(() => controller.abort(), 80_000);
          try {
            const response = await fetch('/api/tour/audio', {
              method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ language, step: step.id }),
            });
            if (!response.ok) {
              const result = await response.json().catch(() => ({})) as { error?: string };
              throw new Error(result.error ?? 'Narration unavailable.');
            }
            if (!response.headers.get('content-type')?.includes('audio/')) throw new Error('Narration unavailable.');
            const blob = await response.blob();
            if (!live) return;
            url = URL.createObjectURL(blob);
            urls.current.set(key, url);
          } finally { window.clearTimeout(timeout); }
        }
        if (!live) return;
        current = new Audio(url);
        current.volume = volume;
        audio.current = current;
        current.onplaying = () => { if (live) setPlaying(true); };
        current.onpause = () => { if (live) setPlaying(false); };
        current.onended = () => { if (live) setPlaying(false); };
        current.onerror = () => { if (live) { setPlaying(false); setMessage(t('Audio unavailable. Continue with captions.', 'Ovoz mavjud emas. Matn bilan davom eting.')); } };
        await current.play();
      } catch (error) {
        if (live) {
          setMessage(t('Narration unavailable. Captions remain available.', 'Ovozli yo‘riqnoma mavjud emas. Matn bilan davom eting.') +
            (language === 'en' && error instanceof Error && !controller.signal.aborted ? ' ' + error.message : ''));
        }
      } finally { if (live) setLoading(false); }
    })();
    return () => {
      live = false;
      controller.abort();
      current?.pause();
      current?.removeAttribute('src');
      audio.current = null;
    };
    // Volume changes update the active element without fetching the clip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, step.id, started, sound, blocked, again]);

  function move(next: number) {
    audio.current?.pause();
    setPlaying(false); setLoading(false); setMessage('');
    setIndex(next);
  }
  function toggle() {
    if (playing) { audio.current?.pause(); return; }
    if (audio.current) void audio.current.play().catch(() => setMessage(t('Press Replay to try again.', 'Qayta eshitish tugmasini bosing.')));
    else { setStarted(true); setSound(true); setAgain(n => n + 1); }
  }

  const mobile = viewport.width < 700;
  const top = rect ? rect.bottom + 16 : 80;
  const left = rect ? Math.max(12, Math.min(viewport.width - 380, rect.right - 360)) : Math.max(12, viewport.width - 380);
  // Prefer the opposite side of a large stage, keeping the canvas available to pointer input.
  const position = mobile ? { bottom: 12, left: 12, right: 12 } :
    top + 600 < viewport.height ? { top, left } : { top: 80, right: 20 };

  return <>
    {rect && <div className="tour-spotlight" aria-hidden="true" style={{
      left: Math.max(2, rect.left - 4), top: Math.max(2, rect.top - 4),
      width: Math.min(viewport.width - 4, rect.width + 8), height: Math.min(viewport.height - 4, rect.height + 8),
    }} />}
    <section className="voice-tour" role="dialog" aria-modal="false" aria-labelledby="tour-title" aria-describedby="tour-caption"
      tabIndex={-1} ref={panel} style={position}>
      <div className="tour-top"><span>BioTwin / {t('GUIDE', 'YO‘RIQNOMA')}</span>
        <button onClick={dismiss} aria-label={t('Close guide', 'Yo‘riqnomani yopish')}><X size={17} /></button></div>
      <div className="tour-progress" aria-label={t('Tour progress', 'Yo‘riqnoma bosqichi')}>{tourSteps.map((item, i) =>
        <span key={item.id} className={i <= index ? 'reached' : ''} />)}</div>
      <div className="tour-language"><span>{String(index + 1).padStart(2, '0')} / 09</span>
        <button aria-pressed={language === 'uz'} onClick={() => setLanguage('uz')}>O‘zbekcha</button>
        <button aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button></div>
      <h2 id="tour-title">{title}</h2>
      <p id="tour-caption">{caption}</p>
      {blocked && <p className="tour-notice" role="status">{t('Open a patient from the library, then continue here.', 'Kutubxonadan bemorni oching, so‘ng shu yerda davom eting.')}</p>}
      {!blocked && !rect && step.studio && <p className="tour-notice">{t('This control is unavailable in this view. Choose a modeled patient to explore simulation controls.', 'Ushbu ko‘rinishda bu boshqaruv mavjud emas. Simulyatsiya uchun modellashtirilgan bemorni tanlang.')}</p>}
      {message && <p className="tour-notice" role="status">{message}</p>}
      {!started ? <div className="tour-start">
        <button className="primary" onClick={() => { setStarted(true); setSound(true); }}><Volume2 size={16} />{t('Start guided tour', 'Ovozni boshlash')}</button>
        <button onClick={() => { setStarted(true); setSound(false); }}>{t('Continue without sound', 'Ovozsiz davom etish')}</button>
      </div> : <div className="tour-audio">
        <button onClick={toggle} disabled={loading || blocked} aria-label={playing ? t('Pause narration', 'Ovozni to‘xtatish') : t('Play narration', 'Ovozni eshitish')}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <button onClick={() => { setSound(true); setAgain(n => n + 1); }} disabled={loading || blocked} aria-label={t('Replay this step', 'Qadamni qayta eshitish')}><RotateCcw size={16} /></button>
        <span className={playing ? 'tour-wave active' : 'tour-wave'} aria-hidden="true"><i /><i /><i /><i /><i /></span>
        <span className="tour-audio-status" aria-live="polite">{loading ? t('Preparing audio…', 'Ovoz tayyorlanmoqda…') : playing ? t('Playing', 'Eshitilmoqda') : t('Captions', 'Matn')}</span>
      </div>}
      <div className="tour-volume">
        <button onClick={() => { setSound(!sound); setMessage(''); }} aria-label={sound ? t('Mute narration', 'Ovozni o‘chirish') : t('Enable narration', 'Ovozni yoqish')} aria-pressed={sound}>{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
        <label>{t('Volume', 'Ovoz balandligi')}<input type="range" min="0" max="1" step=".1" value={volume} onChange={e => { const value = Number(e.target.value); setVolume(value); if (audio.current) audio.current.volume = value; }} /></label>
      </div>
      <div className="tour-navigation">
        <button onClick={dismiss}>{t('Skip', 'O‘tkazib yuborish')}</button>
        <button disabled={index === 0} onClick={() => move(index - 1)} aria-label={t('Previous step', 'Oldingi qadam')}><ArrowLeft size={16} /></button>
        <button className="primary" disabled={blocked} onClick={() => {
          if (index === tourSteps.length - 1) dismiss();
          else { setStarted(true); move(index + 1); }
        }}>{index === tourSteps.length - 1 ? t('Finish', 'Yakunlash') : t('Next', 'Keyingi')}<ArrowRight size={16} /></button>
      </div>
    </section>
  </>;
}

