import { describe, expect, it } from 'vitest';
import {
    buildGuardianGuidanceFromPayload,
    extractGuidanceParts,
} from '../../services/zarathustraService';

const BANNED_GENERIC = [
  /acceptable/i,
  /sans signal de danger/i,
  /aucun signal de danger/i,
  /\bvalid\w*\b/i,
  /\bok\b/i,
  /n apporte pas de sens/i,
  /nom ou prenom simple/i,
];

const CASES = [
  { step: 'name', value: 'Aurore', expected: /seuil|nom|présence|passage/i },
  { step: 'mood', value: 'Crépuscule', expected: /climat|humeur|lumière/i },
  { step: 'weight', value: 'Le Devoir', expected: /poids|gravité|travers/i },
  {
    step: 'fear',
    value: 'J ai peur de me perdre',
    expected: /peur|ombre|bord|fracture/i,
  },
  {
    step: 'desire',
    value: 'La Vérité',
    expected: /désir|direction|axe|hauteur/i,
  },
  {
    step: 'sacrifice',
    value: 'Mon Confort',
    expected: /sacrifice|passage|perte/i,
  },
  { step: 'social', value: "L'Ermite", expected: /cercle|place|autres/i },
  {
    step: 'eternity',
    value: 'La Joie',
    expected: /retour|durée|éternité|recommencé/i,
  },
  { step: 'format', value: 'Le Marteau', expected: /forme|vérité|frapper/i },
  {
    step: 'question',
    value: 'Que dois-je dépasser ?',
    expected: /question|nœud|invocation|appel/i,
  },
];

describe('guardian microcopy contract', () => {
  it.each(CASES)(
    'renders stable two-level guidance for $step',
    ({ step, value, expected }) => {
      const result = buildGuardianGuidanceFromPayload(step, value, {
        isSafe: true,
        confidence: 0.9,
      });

      const parts = extractGuidanceParts(result.comment);

      expect(result.isSafe).toBe(true);
      expect(parts.echo.length).toBeGreaterThan(18);
      expect(parts.subcomment.length).toBeGreaterThan(30);
      expect(parts.echo.length).toBeLessThan(180);
      expect(parts.subcomment.length).toBeLessThan(280);
      expect(result.comment).toMatch(expected);

      for (const pattern of BANNED_GENERIC) {
        expect(result.comment).not.toMatch(pattern);
      }
    },
  );

  it('name step never falls back to bureaucratic acceptance wording', () => {
    const result = buildGuardianGuidanceFromPayload('name', 'Aurore', {
      comment: 'Le prénom "Aurore" est acceptable.',
      isSafe: true,
      confidence: 0.9,
    });

    expect(result.comment).toContain('Aurore');
    expect(result.comment).not.toMatch(
      /acceptable|sans signal de danger|valid\w*/i,
    );
  });
});
