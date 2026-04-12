export function createScrambler(seed = 1337) {
  // Mini Générateur Pseudo-Aléatoire local pour garantir le déterminisme des tests
  let currentSeed = seed;
  const rand = () => {
    currentSeed = (currentSeed * 16807) % 2147483647;
    return (currentSeed - 1) / 2147483646;
  };

  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+<>~';

  return {
    /**
     * @param {string} text - Le texte cible
     * @param {number} progress - De 0.0 (totalement brouillé) à 1.0 (parfaitement lisible)
     * @param {number} chaos - (0.0 à 1.0) Définit l'épaisseur de la zone de brouillage
     */
    decode: (text, progress, chaos = 0.5) => {
      if (progress >= 1) return text;
      if (progress <= 0) return '';

      let result = '';
      // La largeur de la "vague" de décryptage dépend du chaos
      const scrambleWidth = Math.max(0.1, chaos * 0.3); 

      for (let i = 0; i < text.length; i++) {
        // Ignorer les espaces pour préserver la structure des mots
        if (text[i] === ' ' || text[i] === '\n') {
          result += text[i];
          continue;
        }

        const charProgress = i / text.length;

        if (progress > charProgress + scrambleWidth) {
          // La vague est passée, la lettre est figée et correcte
          result += text[i];
        } else if (progress > charProgress) {
          // La vague est sur la lettre, elle mute (Matrix)
          result += GLYPHS[Math.floor(rand() * GLYPHS.length)];
        } else {
          // La vague n'est pas encore arrivée, la lettre est invisible
          result += '';
        }
      }
      return result;
    }
  };
}
