import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionPath = path.join(__dirname, '../server/.runtime/session.json');

function readApiSession() {
  try {
    return JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
  } catch {
    return { host: '127.0.0.1', port: 39281, token: '' };
  }
}

function resolveProxyTarget() {
  const session = readApiSession();
  const host = session.host || '127.0.0.1';
  const port = session.port || 39281;
  return `http://${host}:${port}`;
}

export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:39281',
        changeOrigin: true,
        router: () => resolveProxyTarget(),
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq) => {
            const session = readApiSession();
            if (session.token) {
              proxyReq.setHeader('Authorization', `Bearer ${session.token}`);
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
