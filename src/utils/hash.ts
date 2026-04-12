// src/utils/hash.ts

// Hash simple et déterministe d'une chaîne vers un entier positif.
export function hashStringToInt(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
