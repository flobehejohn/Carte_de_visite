import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { retrieveZaraCitations } from './retriever.js';

const fixturePath = path.join(
  process.cwd(),
  'src',
  'server',
  'knowledge',
  '__fixtures__',
  'zara.sample.sentences.json',
);

const sentences = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as any[];

describe('zarathoustra retriever', () => {
  it('returns stable results with source and ids', () => {
    const res1 = retrieveZaraCitations('Zarathoustra montagne solitude', {
      k: 3,
      sentences,
    });
    const res2 = retrieveZaraCitations('Zarathoustra montagne solitude', {
      k: 3,
      sentences,
    });

    expect(res1).toEqual(res2);
    expect(res1.length).toBeGreaterThanOrEqual(2);
    expect(res1.every((c) => c.source === 'zarathoustra')).toBe(true);
    expect(res1.every((c) => String(c.id).length > 0)).toBe(true);
  });

  it('falls back deterministically when tokens are empty', () => {
    const res = retrieveZaraCitations('xx', { k: 2, sentences });
    expect(res.map((c) => c.id)).toEqual(['1', '2']);
  });
});
