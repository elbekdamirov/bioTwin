import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '../src/sim/engine/SimulationEngine';
import { initialProfile, intervention, makeScenario, parseProfile } from '../src/biotwin/model';
import { updateVisualState } from '../src/client/visualState';
import { createDefaultVisualState } from '../src/three/types';

const profile = initialProfile('diabetes');
function baseline() {
  return SimulationEngine.create({ seed: profile.seed, scenario: makeScenario(profile) });
}

describe('BioTwin scenario integration', () => {
  it('keeps the breathing clock independent for simultaneously rendered twins', () => {
    const snapshot = baseline().snapshot();
    const a = createDefaultVisualState();
    const b = createDefaultVisualState();
    const control = createDefaultVisualState();
    updateVisualState(a, snapshot, .2, 1);
    updateVisualState(b, snapshot, .7, 1);
    updateVisualState(a, snapshot, .2, 1);
    updateVisualState(control, snapshot, .2, 1);
    updateVisualState(control, snapshot, .2, 1);
    expect(a.breathPhase).toBe(control.breathPhase);
    expect(b.breathPhase).not.toBe(a.breathPhase);
  });
  it('uses the edited synthetic height and weight in patient generation', () => {
    const engine = SimulationEngine.create({ seed: 'anthropometrics', scenario: makeScenario({ ...initialProfile('heart', false), height: 182.4, weight: 88 }) });
    expect(engine.meta().patient).toMatchObject({ ageYears: 64, sex: 'male', heightCm: 182.4, weightKg: 88 });
    expect(() => parseProfile({ ...profile, height: 140, weight: 180 })).toThrow(/BMI/);
  });

  it('applies the catalog insulin infusion and changes engine glucose without affecting A', () => {
    const A = baseline();
    const B = SimulationEngine.restore(A.serialize());
    const control = SimulationEngine.restore(A.serialize());
    expect(A.s.phys.chem.glucose).toBe(B.s.phys.chem.glucose);
    const action = intervention('diabetes')!.actions[0]!;
    expect(B.dispatch(action).ok).toBe(true);
    for (let i = 0; i < 3000; i++) {
      A.step(); B.step(); control.step();
    }
    expect(B.s.events.some(e => e.code === 'drug.infusion')).toBe(true);
    expect(A.s.events.some(e => e.code === 'drug.infusion')).toBe(false);
    expect(A.s.phys.chem.glucose).toBe(control.s.phys.chem.glucose);
    expect(B.s.tick).toBe(A.s.tick);
    expect(B.s.phys.chem.glucose).toBeLessThan(A.s.phys.chem.glucose);
  });

  it('applies the two bounded settings to identical physiology and distinguishes their glucose response', () => {
    const initial = baseline().serialize();
    const low = SimulationEngine.restore(initial);
    const high = SimulationEngine.restore(initial);
    expect(low.dispatch(intervention('diabetes', .05)!.actions[0]!).ok).toBe(true);
    expect(high.dispatch(intervention('diabetes', .1)!.actions[0]!).ok).toBe(true);
    expect(() => intervention('diabetes', .06)).toThrow(/available simulation rates/);
    for (let i = 0; i < 3000; i++) { low.step(); high.step(); }
    expect(high.s.phys.chem.glucose).toBeLessThan(low.s.phys.chem.glucose);
    expect(high.s.tick).toBe(low.s.tick);
    expect(low.s.events.find(event => event.code === 'drug.infusion')?.message).toContain('0.05');
    expect(high.s.events.find(event => event.code === 'drug.infusion')?.message).toContain('0.1');
  });

  it('keeps annotations out of scenario creation and builds a stable type 2 diabetes scenario', () => {
    expect(makeScenario({ ...profile, history: 'Context note', lab: 12 })).toEqual(makeScenario(profile));
    const t2d = makeScenario(initialProfile('t2d'));
    expect(t2d.pathologies).toEqual([]);
    expect(t2d.patient.requiredHistory).toContain('type2Diabetes');
  });

  it('restores a treated branch and continues deterministically', () => {
    const original = baseline();
    expect(original.dispatch(intervention('diabetes')!.actions[0]!).ok).toBe(true);
    for (let i = 0; i < 250; i++) original.step();
    const restored = SimulationEngine.restore(original.serialize());
    expect(restored.s.events).toEqual(original.s.events);
    expect(restored.s.therapy.infusions[0]?.totalMl).toBe(Infinity);
    for (let i = 0; i < 250; i++) { restored.step(); original.step(); }
    expect(restored.s.phys).toEqual(original.s.phys);
    expect(restored.s.history).toEqual(original.s.history);
  });

});
