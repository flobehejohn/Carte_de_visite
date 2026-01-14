import { describe, it, expect } from 'vitest';
import { extractFirstJsonObject } from './jsonExtract';

describe('extractFirstJsonObject', () => {
  it('extracts the first parseable object from mixed text', () => {
    const text = 'intro ```json\\n{"a":1,"b":"x"}\\n``` tail';
    const data = extractFirstJsonObject(text);
    expect(data).toEqual({ a: 1, b: 'x' });
  });

  it('prefers the first parseable object when multiple exist', () => {
    const text = 'x {"a":1} y {"b":2}';
    const data = extractFirstJsonObject(text);
    expect(data).toEqual({ a: 1 });
  });

  it('ignores braces inside strings', () => {
    const text = '{"a":"{not}"} trailing {"b":2}';
    const data = extractFirstJsonObject(text);
    expect(data).toEqual({ a: '{not}' });
  });
});
