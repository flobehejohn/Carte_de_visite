import { describe, it, expect } from 'vitest';
import { analyzeEnglishLikelihood, ZaraLangGuard } from './zaraLangGuard';

describe('zaraLangGuard', () => {
  it('flags english text as likely English', () => {
    const result = analyzeEnglishLikelihood('this is a simple test with common english words');
    expect(result.isEnglishLikely).toBe(true);
  });

  it('does not flag short French text as English', () => {
    const guard = new ZaraLangGuard(false);
    const retry = guard.shouldRetry('je suis dans la nuit et je regarde le silence');
    expect(retry).toBe(false);
  });
});
