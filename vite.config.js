var _a, _b;
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
var port = Number((_a = process.env.PORT) !== null && _a !== void 0 ? _a : '5173');
export default defineConfig({
    plugins: [react()],
    server: {
        host: '127.0.0.1',
        port: port,
        strictPort: true,
    },
    preview: {
        host: '127.0.0.1',
        port: Number((_b = process.env.PORT) !== null && _b !== void 0 ? _b : '4173'),
        strictPort: true,
    },
});
