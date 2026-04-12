import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        // On teste UNIQUEMENT le code source réel
        include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
        // On exclut tous les artefacts / backups / sorties
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '**/coverage/**',
            '**/.git/**',
            '**/audit/**',
            '**/_bak*/**',
            '**/_bak_*/**',
            '**/_archive*/**',
        ],
        environment: 'node',
        // optionnel : si tu veux des erreurs plus lisibles
        // reporters: ["default"],
    },
});
