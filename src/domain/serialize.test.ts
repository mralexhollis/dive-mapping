import { describe, expect, it } from 'vitest';
import { siteFromJson, siteToJson, trySiteFromJson } from './serialize';
import { emptySite } from './types';

describe('siteToJson / siteFromJson', () => {
  it('round-trips an empty site without changes', () => {
    const a = emptySite('round-trip');
    const json = siteToJson(a);
    const b = siteFromJson(json);
    expect(b).toEqual(a);
  });

  it('round-trips a site populated with a POI and a bearing', () => {
    const a = emptySite('with-data');
    a.layers.poi.pois.push({ id: 'p1', name: 'Stanegarth', type: 'wreck', depth: 22 });
    a.layers.poi.pois.push({ id: 'p2', name: 'Wessex', type: 'vehicle', depth: 22 });
    a.layers.poi.bearings.push({
      id: 'b1',
      fromId: 'p1',
      toId: 'p2',
      bearingDeg: 235,
      distanceM: 18,
    });
    const b = siteFromJson(siteToJson(a));
    expect(b).toEqual(a);
  });

  it('preserves unknown future fields on objects', () => {
    const a = emptySite('forward-compat');
    const json = JSON.parse(siteToJson(a));
    json.meta.futureField = 'hello';
    json.layers.poi.futureLayerField = 42;
    const back = siteFromJson(JSON.stringify(json));
    // @ts-expect-error — unknown field preserved through passthrough.
    expect(back.meta.futureField).toBe('hello');
    // @ts-expect-error — unknown field preserved through passthrough.
    expect(back.layers.poi.futureLayerField).toBe(42);
  });

  it('rejects malformed input', () => {
    expect(() => siteFromJson('{}')).toThrow();
    expect(() => siteFromJson('not json')).toThrow();
  });

  it('trySiteFromJson returns null on failure', () => {
    expect(trySiteFromJson('not json')).toBeNull();
    expect(trySiteFromJson('{}')).toBeNull();
  });
});
