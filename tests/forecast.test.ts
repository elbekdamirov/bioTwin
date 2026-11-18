import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculateForecast, ForecastInputsSchema, STENO_COEFFICIENTS, syntheticForecastInputs } from '../src/biotwin/forecast/steno';
import { initialProfile, makeScenario, parseProfile } from '../src/biotwin/model';

const originalCase = { ...initialProfile('diabetes'), age: 50, sex: 'female' as const, forecast: syntheticForecastInputs(50) };

describe('Steno Type 1 Risk Engine five-year adapter', () => {
  it('reproduces the pinned upstream five-year reference cases to their reported precision', () => {
    const standard = calculateForecast(originalCase);
    const higher = calculateForecast({ ...originalCase, age: 60, forecast: {
      ...originalCase.forecast, durationYears: 25, hba1cMmolMol: 90, restingSbp: 150, ldlMmolL: 4, egfr: 70,
    } });
    expect(standard.status).toBe('estimated');
    expect(higher.status).toBe('estimated');
    if (standard.status !== 'estimated' || higher.status !== 'estimated') throw new Error('Missing estimate');
    // Upstream metatool/test_models.js selected live-tool reference cases.
    expect((standard.probability * 100).toFixed(1)).toBe('6.1');
    expect((higher.probability * 100).toFixed(1)).toBe('16.4');
    expect(standard.provenance.horizonYears).toBe(5);
    expect(standard.probability).toBeGreaterThan(0);
    expect(standard.probability).toBeLessThan(1);
  });

  it('matches all ported coefficients to the retained MIT source', () => {
    const python = readFileSync('third_party/steno/steno_t1.py', 'utf8');
    const block = python.split('"cvd": {')[1]!.split('},')[0]!;
    const names: Record<keyof typeof STENO_COEFFICIENTS, string> = {
      intercept: 'alpha', age: 'age', female: 'female', duration: 'duration', sbp: 'sbp', ldl: 'ldl',
      hba1c: 'hba1c_mmol', micro: 'micro', macro: 'macro', log2EgfrUnder40: 'log2egfr_lt40',
      log2Egfr40Plus: 'log2egfr_ge40', smoking: 'smoking', noExercise: 'no_exercise',
    };
    for (const [key, name] of Object.entries(names)) {
      const value = Number(block.match(new RegExp('"' + name + '":\\s*(-?[0-9.]+)'))![1]);
      expect(STENO_COEFFICIENTS[key as keyof typeof STENO_COEFFICIENTS]).toBe(value);
    }
  });

  it('requires complete inputs and supports neither prior CVD nor other disease populations', () => {
    expect(calculateForecast(initialProfile('diabetes')).status).toBe('missing-inputs');
    expect(calculateForecast({ ...originalCase, preset: 'heart' })).toMatchObject({status:'ineligible',reason:'preset'});
    expect(calculateForecast({ ...originalCase, preset: 'general' })).toMatchObject({status:'ineligible',reason:'preset'});
    expect(calculateForecast({ ...originalCase, age: 95 })).toMatchObject({status:'ineligible',reason:'age'});
    expect(calculateForecast({ ...originalCase, forecast: {...originalCase.forecast, priorCvd:true} })).toMatchObject({status:'ineligible',reason:'prior-cvd'});
    expect(calculateForecast({ ...originalCase, forecast: {...originalCase.forecast, durationYears:60} })).toMatchObject({status:'ineligible',reason:'duration'});
    expect(ForecastInputsSchema.safeParse({...originalCase.forecast,egfr:0}).success).toBe(false);
    expect(calculateForecast({ ...originalCase, forecast: {...originalCase.forecast,egfr:Number.NaN} }).status).toBe('ineligible');
  });

  it('responds to supported clinical changes while leaving the acute scenario unchanged', () => {
    const low = calculateForecast(originalCase);
    const high = calculateForecast({ ...originalCase, forecast: {...originalCase.forecast, smoking:true, albuminuria:'macro', hba1cMmolMol:100} });
    if (low.status !== 'estimated' || high.status !== 'estimated') throw new Error('Missing estimate');
    expect(high.probability).toBeGreaterThan(low.probability);
    expect(makeScenario(originalCase)).toEqual(makeScenario({...originalCase,forecast:null}));
  });

  it('migrates old profiles with no forecast field and roundtrips saved inputs without external requests', () => {
    const old = {...initialProfile('diabetes')} as Partial<ReturnType<typeof initialProfile>>;
    delete old.forecast;
    expect(parseProfile(old).forecast).toBe(null);
    const restored = parseProfile(JSON.parse(JSON.stringify(originalCase)));
    expect(calculateForecast(restored)).toEqual(calculateForecast(originalCase));
  });
});

