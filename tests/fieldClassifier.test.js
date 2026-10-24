import { describe, expect, it } from 'vitest';
import { HIGH_FROM, UNCLEAR_BELOW, buildFieldVectors, classify, confidenceOf, fieldScores, placeRole } from '../server/fieldClassifier.js';

const unit = (position, size = 3) => Array.from({ length: size }, (_, i) => (i === position ? 1 : 0));

describe('buildFieldVectors', () => {
  const skillTexts = ['Write code', 'Debug code', 'Nurse patients', 'Weld pipes'];
  const skillVectors = Float32Array.from([unit(0), unit(0), unit(1), unit(2)].flat());
  const rows = { code: [0, 1], patients: [2], pipes: [3], nothing: [] };
  const rank = (word) => rows[word] ?? [];

  it('averages the saved vectors of the skills the search words find, as a unit vector, without repeats', () => {
    const [tech] = buildFieldVectors({ fields: [{ id: 'tech', label: 'Tech', definition: 'd', searchWords: ['code', 'code'] }], rank, skillTexts, skillVectors, dimension: 3 });
    expect(tech.seeds).toEqual(['Write code', 'Debug code']);
    expect(Array.from(tech.vector)).toEqual([1, 0, 0]);
  });
  it('mixes the seeds of several words and caps seeds per word', () => {
    const [mixed] = buildFieldVectors({ fields: [{ id: 'm', label: 'M', definition: 'd', searchWords: ['code', 'patients'] }], rank, skillTexts, skillVectors, dimension: 3, perWord: 1 });
    expect(mixed.seeds).toEqual(['Write code', 'Nurse patients']);
    expect(Math.hypot(...mixed.vector)).toBeCloseTo(1, 10);
    expect(mixed.vector[0]).toBeCloseTo(mixed.vector[1], 10);
  });
  it('refuses a field whose words find no skill', () => {
    expect(() => buildFieldVectors({ fields: [{ id: 'empty', searchWords: ['nothing'] }], rank, skillTexts, skillVectors, dimension: 3 })).toThrow(/empty/);
  });
});

describe('fieldScores and classify', () => {
  const fields = [
    { id: 'a', vector: Float64Array.from([1, 0, 0]) },
    { id: 'b', vector: Float64Array.from([0, 1, 0]) },
    { id: 'c', vector: Float64Array.from([0, 0, 1]) },
  ];
  it('scores a role vector against every field, best first, and works at any offset', () => {
    const vectors = Float32Array.from([0, 0, 0, 0.8, 0.6, 0]);
    const scores = fieldScores(vectors, 3, fields, 3);
    expect(scores.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(scores[0].score).toBeCloseTo(0.8, 6);
  });
  it('a clear lead is high confidence with no related field', () => {
    const field = classify([{ id: 'a', score: 0.7 }, { id: 'b', score: 0.6 }, { id: 'c', score: 0.5 }]);
    expect(field).toMatchObject({ primary: 'a', second: 'b', confidence: 'high', related: [] });
    expect(field.margin).toBeCloseTo(0.1, 6);
    expect(field.scores).toEqual({ a: 0.7, b: 0.6, c: 0.5 });
  });
  it('a near tie is unclear and lists the close fields as related', () => {
    const field = classify([{ id: 'a', score: 0.6 }, { id: 'b', score: 0.595 }, { id: 'c', score: 0.59 }]);
    expect(field.confidence).toBe('unclear');
    expect(field.related).toEqual(['b', 'c']);
  });
  it('confidence cut-offs are the documented constants', () => {
    expect(confidenceOf(UNCLEAR_BELOW - 0.0001)).toBe('unclear');
    expect(confidenceOf(UNCLEAR_BELOW)).toBe('medium');
    expect(confidenceOf(HIGH_FROM - 0.0001)).toBe('medium');
    expect(confidenceOf(HIGH_FROM)).toBe('high');
  });
});

describe('placeRole', () => {
  const clear = { primary: 'tech', second: 'data', confidence: 'high' };
  const unclear = { primary: 'office', second: 'data', confidence: 'unclear' };
  it('puts a role in your field when its best field is one of yours', () => {
    expect(placeRole(clear, ['tech'])).toBe('in');
    expect(placeRole(clear, ['business'])).toBe('other');
  });
  it('an unclear role whose second field is yours stays in your field; a clear one does not', () => {
    expect(placeRole(unclear, ['data'])).toBe('in');
    expect(placeRole({ ...unclear, confidence: 'medium' }, ['data'])).toBe('other');
  });
  it('cannot place without a field or without your fields', () => {
    expect(placeRole(null, ['tech'])).toBeNull();
    expect(placeRole(clear, [])).toBeNull();
    expect(placeRole(clear, undefined)).toBeNull();
  });
});
