import { useEffect, useRef, useState } from 'react';
import { SimClient } from '@/client/simClient';
import type { SimSnapshot } from '@/sim/engine/snapshot';
import type { SimAction } from '@/sim/interventions/actions';
import type { SimulationEvent } from '@/sim/types';
import {recordsApi} from './records/client';
import type {PatientRecord} from './records/schema';
import { makeScenario, parseProfile, type Profile } from './model';

export type Branch = 'A' | 'B';
export type Frames = Record<Branch, SimSnapshot[]>;
type Saved = { version: 1; profile: Profile; frames: Frames; engines: Record<Branch, string | null> };
type LoggedAction = { tick: number; action: SimAction };
const storageKey = 'biotwin-session-v1';
const indexKey = 'biotwin-recent-v1';
type Recent = { key: string; preset: Profile['preset']; seed: string; savedAt: string };
export const maxTick = 18_000;

function readRecent(): Recent[] {
  try {
    const found: unknown = JSON.parse(localStorage.getItem(indexKey) ?? '[]');
    if (!Array.isArray(found)) return [];
    return found.filter(entry => entry && typeof entry.key === 'string' && entry.key.startsWith(storageKey + ':') &&
      typeof entry.seed === 'string' && typeof entry.savedAt === 'string' &&
      ['t2d', 'diabetes', 'heart'].includes(entry.preset));
  } catch {
    return [];
  }
}

function preferredSpeed() {
  try {
    const value = Number(localStorage.getItem('biotwin-speed'));
    return [1, 5, 20, 60].includes(value) ? value : 20;
  } catch { return 20; }
}

function waitForWorker(client: SimClient, start: () => void): Promise<SimSnapshot> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); unsubscribe(); unsubscribeError(); };
    const unsubscribe = client.onCreated((_meta, snapshot) => { cleanup(); resolve(snapshot); });
    const unsubscribeError = client.onError(message => { cleanup(); reject(new Error(message)); });
    const timer = window.setTimeout(() => { cleanup(); reject(new Error('Simulation worker did not initialize.')); }, 25_000);
    start();
  });
}

export function useSession() {
  const workers = useRef<Record<Branch, SimClient | null>>({ A: null, B: null });
  const data = useRef<Frames>({ A: [], B: [] });
  const [frames, setFrames] = useState(data.current);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const release = useRef<Promise<void> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(preferredSpeed);
  const [recent, setRecent] = useState(readRecent);
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  const [events, setEvents] = useState<Record<Branch, SimulationEvent[]>>({ A: [], B: [] });

  useEffect(() => () => {
    workers.current.A?.dispose();
    workers.current.B?.dispose();
  }, []);

  useEffect(() => {
    try { localStorage.setItem('biotwin-speed', String(speed)); } catch { /* hold preference in memory */ }
  }, [speed]);

  function publish(next: Frames) {
    data.current = next;
    setFrames(next);
  }

  async function operation(task: () => Promise<void>, lockUi = true) {
    if (lockUi) {
      while (release.current) await release.current;
    } else if (release.current) return false;
    let finish!: () => void;
    release.current = new Promise<void>(resolve => { finish = resolve; });
    if (lockUi) {
      setBusy(true);
      setMessage('');
    }
    try {
      await task();
      setProblem('');
      return true;
    } catch (error) {
      setPlaying(false);
      setProblem(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      release.current = null;
      finish();
      if (lockUi) setBusy(false);
    }
  }

  async function open(input: Profile, compare = false, saved?: Saved) {
    const nextProfile = parseProfile(input);
    const next: typeof workers.current = { A: null, B: null };
    const initial: Frames = { A: [], B: [] };
    const scenario = makeScenario(nextProfile);
    try {
      if (scenario) {
        const branches: Branch[] = compare ? ['A', 'B'] : ['A'];
        await Promise.all(branches.map(async branch => {
          const client = new SimClient();
          next[branch] = client;
          client.setSpeed(0);
          const serialized = saved?.engines[branch];
          const snapshot = await waitForWorker(client, () => serialized
            ? client.restore(serialized)
            : client.create(nextProfile.seed, scenario));
          const history = saved?.frames[branch];
          const last = history?.at(-1);
          if (saved && (!last || last.tick !== snapshot.tick || history![0]?.tick !== 0 ||
            history!.length > maxTick / 50 + 1 || history!.some((frame, i) =>
              !frame.appearance || !frame.derived || !frame.therapy || !frame.phys?.cv || !frame.phys?.resp || !frame.phys?.chem ||
              !Number.isFinite(frame.t) || frame.tick <= (history![i - 1]?.tick ?? -1)))) {
            throw new Error('Saved frame history does not match the worker state.');
          }
          initial[branch] = history ?? [snapshot];
        }));
      }
      const logs = await readEvents(next);
      workers.current.A?.dispose();
      workers.current.B?.dispose();
      workers.current = next;
      publish(initial);
      setEvents(logs);
      setProfile(nextProfile);
      setMessage(saved ? 'Saved session loaded.' : compare ? 'Twins share the same starting state.' : '');
    } catch (error) {
      next.A?.dispose();
      next.B?.dispose();
      throw error;
    }
  }

  async function readEvents(current = workers.current) {
    const [A, B] = await Promise.all([current.A?.allEvents(), current.B?.allEvents()]);
    return { A: A ?? [], B: B ?? [] };
  }

  async function sample(ticks: number, actions: SimAction[], target: Branch) {
    const current = workers.current;
    if (!current.A) return false;
    const previous = data.current;
    const [a, b] = await Promise.all([
      current.A.advance(ticks, target === 'A' ? actions : []),
      current.B?.advance(ticks, target === 'B' ? actions : []),
    ]);
    const append = (branch: Branch, entry: typeof a) => {
      const history = previous[branch];
      const last = history.at(-1);
      if (entry.snapshot.tick === last?.tick) return history;
      return [...history, { ...entry.snapshot, events: [] }];
    };
    publish({ A: append('A', a), B: b ? append('B', b) : [] });
    if (a.snapshot.eventCount !== previous.A.at(-1)?.eventCount || b?.snapshot.eventCount !== previous.B.at(-1)?.eventCount) {
      setEvents(await readEvents(current));
    }
    const errors = [...a.errors, ...b?.errors ?? []];
    if (errors.length) throw new Error(errors.join('. '));
    return a.snapshot.status.phase === 'active' &&
      (!b || b.snapshot.status.phase === 'active') && a.snapshot.tick < maxTick;
  }

  useEffect(() => {
    if (!playing) return;
    const timeout = window.setInterval(() => {
      void operation(async () => {
        if (!await sample(50, [], 'A')) setPlaying(false);
      }, false);
    }, 5000 / speed);
    return () => window.clearInterval(timeout);
  });

  function stopAndRun(task: () => Promise<void>) {
    setPlaying(false);
    return operation(task);
  }

  return {
    profile, frames, events, busy, problem, message, playing, setPlaying, speed, setSpeed, recent,
    updateRecordIdentity:(patientId:string,displayName:string)=>{if(profile)setProfile(parseProfile({...profile,patientId,displayName}));},
    updateClinical: (clinical: Profile['clinical'], body?: { weight?: number; height?: number; age?: number; sex?: Profile['sex'] }) => {
      if (!profile) return false;
      try {
        setProfile(parseProfile({ ...profile, ...body, clinical }));
        setProblem('');
        return true;
      } catch {
        setProblem('Check the patient measurements and units.');
        return false;
      }
    },
    updateForecast: (forecast: Profile['forecast']) => {
      if (!profile) return;
      try {
        setProfile(parseProfile({ ...profile, forecast }));
        setProblem('');
        setMessage('');
      } catch {
        setProblem('Check the forecast inputs and units.');
      }
    },
    start: (input: Profile) => stopAndRun(() => open(input)),
    clone: () => profile && stopAndRun(() => open(profile, true)),
    reset: () => profile && stopAndRun(() => open(profile, !!workers.current.B)),
    resetB: () => profile && stopAndRun(async () => {
      const worker = new SimClient();
      worker.setSpeed(0);
      try {
        const fresh = await waitForWorker(worker, () => worker.create(profile.seed, makeScenario(profile)));
        const samples = [fresh];
        for (const frame of data.current.A.slice(1)) {
          const { snapshot } = await worker.advance(frame.tick - samples.at(-1)!.tick);
          samples.push({ ...snapshot, events: [] });
        }
        const B = await worker.allEvents();
        workers.current.B?.dispose();
        workers.current.B = worker;
        publish({ ...data.current, B: samples });
        setEvents(logs => ({ ...logs, B }));
        setMessage('Twin B restored to the untreated trajectory at the current clock.');
      } catch (error) {
        worker.dispose();
        throw error;
      }
    }),
    apply: (branch: Branch, actions: SimAction[]) => stopAndRun(async () => {
      if (!workers.current[branch]) throw new Error('Create the target twin first.');
      if (!await sample(50, actions, branch)) setPlaying(false);
      setMessage('Intervention recorded on twin ' + branch + '.');
    }),
    advanceFiveMinutes: () => stopAndRun(async () => {
      for (let i = 0; i < 60; i++) {
        if (!await sample(50, [], 'A')) break;
      }
    }),
    exportActions: (receive: (actions: Record<Branch, LoggedAction[]>, frames: Frames, events: Record<Branch, SimulationEvent[]>) => void) => stopAndRun(async () => {
      const [A, B] = await Promise.all([workers.current.A?.serialize(), workers.current.B?.serialize()]);
      receive({
        A: A ? (JSON.parse(A).actionLog as LoggedAction[]) : [],
        B: B ? (JSON.parse(B).actionLog as LoggedAction[]) : [],
      }, data.current, await readEvents());
    }),
    saveDatabase:()=>profile && stopAndRun(async()=>{
      const record=await recordsApi<PatientRecord>('/patients',profile);
      const [A,B]=await Promise.all([workers.current.A?.serialize(),workers.current.B?.serialize()]);
      const payload:Saved={version:1,profile:record.profile,frames:data.current,engines:{A:A??null,B:B??null}};
      const compressed=new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('gzip'));
      const bytes=new Uint8Array(await new Response(compressed).arrayBuffer());
      let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      await recordsApi('/patients/'+record.id+'/twin-sessions',{data:btoa(binary),label:record.profile.displayName+' · '+(data.current.B.length?'A/B comparison':'Twin A')});
      setProfile(record.profile);setMessage('Twin session saved in the SQLite database.');
    }),
    save: () => profile && stopAndRun(async () => {
      const [A, B] = await Promise.all([workers.current.A?.serialize(), workers.current.B?.serialize()]);
      const payload: Saved = { version: 1, profile, frames: data.current, engines: { A: A ?? null, B: B ?? null } };
      const compressed = new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('gzip'));
      const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const key = storageKey + ':' + encodeURIComponent(profile.preset + '/' + profile.seed);
      const previous = readRecent().filter(entry => entry.key !== key);
      const updated = [{ key, preset: profile.preset, seed: profile.seed, savedAt: new Date().toISOString() }, ...previous.slice(0, 3)];
      localStorage.setItem(key, btoa(binary));
      localStorage.setItem(indexKey, JSON.stringify(updated));
      for (const extra of previous.slice(3)) localStorage.removeItem(extra.key);
      setRecent(updated);
      setMessage('Session saved on this browser.');
    }),
    load: async (key?: string, encodedOverride?:string) => {
      let loaded: Profile | null = null;
      const ok = await stopAndRun(async () => {
        const encoded = encodedOverride ?? localStorage.getItem(key ?? readRecent()[0]?.key ?? storageKey);
        if (!encoded) throw new Error('There is no saved session in this browser.');
        let saved: Saved;
        try {
          const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
          const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
          saved = JSON.parse(await new Response(stream).text()) as Saved;
          if (saved.version !== 1 || !Array.isArray(saved.frames.A) || !Array.isArray(saved.frames.B) || !saved.engines) throw new Error();
          parseProfile(saved.profile);
          if (typeof saved.engines.A !== 'string') throw new Error();
          if (saved.frames.B.length && typeof saved.engines.B !== 'string') throw new Error();
        } catch {
          throw new Error('The local save is damaged or uses an unsupported format.');
        }
        await open(saved.profile, !!saved.engines.B, saved);
        loaded = saved.profile;
      });
      return ok ? loaded as Profile | null : null;
    },
  };
}
