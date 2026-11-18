import {describe,it,expect} from 'vitest';
import {SimulationEngine} from '../src/sim/engine/SimulationEngine';
import {initialProfile,makeScenario,parseProfile} from '../src/biotwin/model';
import {selectedTreatment,treatmentCheck} from '../src/biotwin/medicines';
import {generatePatient,bodyShapeFor} from '../src/sim/patient/generator';

describe('record-linked medicine experiments',()=>{
  it('uses chronic heart-failure history without introducing an unrelated acute disease and models diuresis only on B',()=>{
    const p=initialProfile('heart');
    const scenario=makeScenario(p);
    expect(scenario.pathologies).toEqual([]);
    const a=SimulationEngine.create({seed:p.seed,scenario});
    expect(a.meta().patient.history.some(h=>h.key==='heartFailure')).toBe(true);
    expect(a.s.phys.cv.ejectionFraction).toBeLessThan(.4);
    const b=SimulationEngine.restore(a.serialize());
    const drug=selectedTreatment(p,'furosemide',.1)!;
    expect(b.dispatch(drug.actions[0]!).ok).toBe(true);
    for(let i=0;i<3000;i++){a.step();b.step();}
    expect(b.s.phys.renal.urineTotal).toBeGreaterThan(a.s.phys.renal.urineTotal);
    expect(b.s.phys.chem.k).toBeLessThan(a.s.phys.chem.k);
    expect(a.s.pharm).not.toEqual(b.s.pharm);
    expect(a.s.status.phase).toBe('active');
  });
  it('blocks recorded allergies, low glucose and low potassium rather than inventing safe treatment',()=>{
    const p=initialProfile('diabetes');
    const s=SimulationEngine.create({seed:p.seed,scenario:makeScenario(p)}).snapshot();
    expect(treatmentCheck({...p,drugAllergies:'insulin'},'insulinRegular',s).blocks).toContain('A matching drug allergy is recorded.');
    expect(treatmentCheck(p,'dextrose10',s).blocks.length).toBeGreaterThan(0);
    s.phys.chem.glucose=3;
    expect(treatmentCheck(p,'insulinRegular',s).blocks.length).toBeGreaterThan(0);
    expect(treatmentCheck(p,'dextrose10',s).blocks).toEqual([]);
    s.phys.chem.glucose=12;s.phys.chem.k=3;
    expect(treatmentCheck(p,'insulinRegular',s).blocks.length).toBeGreaterThan(0);
    expect(selectedTreatment(p,'furosemide',.1)).toBeNull();
  });
  it('uses measured weight to change actual 3D body parameters and migrates old records',()=>{
    const p=initialProfile('t2d');
    const shape=(weight:number)=>bodyShapeFor(generatePatient('same',{ageRange:[p.age,p.age],sex:p.sex,heightCm:p.height,weightKg:weight}));
    expect(shape(100).weightFactor).toBeGreaterThan(shape(62).weightFactor);
    expect(selectedTreatment(p,'semaglutide',.1)).toBeNull();
    const old={...p} as Record<string,unknown>;delete old.drugAllergies;delete old.currentMedicines;delete old.clinical;
    expect(parseProfile(old).drugAllergies).toBe('');
    expect(parseProfile(old).clinical).toBeNull();
    expect(parseProfile({...old,preset:'obesity'}).preset).toBe('t2d');
  });
});

import { DIABETES_DRUGS, HEART_DRUGS } from '../src/biotwin/shortDrugs';
import { SimActionSchema } from '../src/sim/interventions/actions';
describe('short-term drug catalogue', () => {
  it('every dialog drug builds a valid engine action that the engine accepts', () => {
    for (const [preset, list] of [['t2d', DIABETES_DRUGS], ['heart', HEART_DRUGS]] as const) {
      const p = initialProfile(preset);
      for (const d of list) {
        const engine = SimulationEngine.create({ seed: p.seed, scenario: makeScenario(p) });
        const action = SimActionSchema.parse(d.build(d.dose, p.weight));
        const result = engine.dispatch(action);
        expect(result.ok, d.id + ' ' + JSON.stringify(result)).toBe(true);
        expect(d.dose).toBeGreaterThanOrEqual(d.min); expect(d.dose).toBeLessThanOrEqual(d.max);
      }
    }
    expect(DIABETES_DRUGS.length).toBeGreaterThanOrEqual(10); expect(HEART_DRUGS.length).toBeGreaterThanOrEqual(10);
  });
});
