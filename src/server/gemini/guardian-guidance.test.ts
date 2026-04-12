import { describe, expect, it } from 'vitest';

import { composeGuardianGuidanceFromPayload } from '../../shared/guardian/composeGuidance.js';

describe('composeGuardianGuidanceFromPayload', () => {
  it('returns a stable guidance for identity + Jeanne', () => {
    const result = composeGuardianGuidanceFromPayload('identity', 'Jeanne', {
      isSafe: true,
    });

    expect(result.echo).toContain('Jeanne');
    expect(result.echo.length).toBeGreaterThan(18);
    expect(result.subcomment.length).toBeGreaterThan(30);
  });

  it('returns a stable guidance for atmosphere + Brumeux', () => {
    const result = composeGuardianGuidanceFromPayload(
      'atmosphere',
      'Brumeux',
      {
        isSafe: true,
      },
    );

    expect(result.echo).toContain('Brumeux');
    expect(result.echo.length).toBeGreaterThan(18);
    expect(result.subcomment.length).toBeGreaterThan(30);
  });

  it('is deterministic for the same input', () => {
    const a = composeGuardianGuidanceFromPayload('identity', 'Jeanne', {
      isSafe: true,
    });
    const b = composeGuardianGuidanceFromPayload('identity', 'Jeanne', {
      isSafe: true,
    });

    expect(a).toEqual(b);
  });

  it('provides unsafeHint when the step is unsafe', () => {
    const result = composeGuardianGuidanceFromPayload('question', '', {
      isSafe: false,
    });

    expect(result.echo.length).toBeGreaterThan(18);
    expect(result.subcomment.length).toBeGreaterThan(30);
    expect(result.unsafeHint).toBeTruthy();
  });
});
