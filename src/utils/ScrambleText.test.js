import { describe, it, expect } from 'vitest';
import { createScrambler } from './ScrambleText.js';

describe('Thème F - Typographie Organique (Matrix Scramble)', () => {
  const scrambler = createScrambler(42);
  const target = "ZARATHOUSTRA PARLE";

  it('Garantit que le texte est invisible au tout début (progress = 0)', () => {
    const result = scrambler.decode(target, 0.0);
    expect(result).toBe('');
  });

  it('Garantit que le texte est partiellement crypté en cours de rituel (progress = 0.5)', () => {
    const result = scrambler.decode(target, 0.5, 0.8);
    // À 50%, le début "ZARAT" devrait être lisible, la suite brouillée, la fin invisible
    expect(result.substring(0, 4)).toBe('ZARA');
    expect(result.length).toBeLessThan(target.length); // Il n'est pas encore totalement apparu
    expect(result).not.toBe(target); // Il n'est pas encore parfait
  });

  it('Garantit que le texte est parfaitement restitué à la fin (progress = 1.0)', () => {
    const result = scrambler.decode(target, 1.0);
    expect(result).toBe(target);
  });

  it('Garantit le Déterminisme Strict pour la CI Visuelle (VRT)', () => {
    // Deux scramblers avec la même graine doivent produire EXACTEMENT le même chaos
    const s1 = createScrambler(999);
    const s2 = createScrambler(999);
    
    const r1 = s1.decode(target, 0.4, 0.5);
    const r2 = s2.decode(target, 0.4, 0.5);
    
    expect(r1).toBe(r2);
  });
});
