/**
 * 等本地 API 就绪后再启动 Vite，避免并发 dev 时首屏 /api/* 触发 proxy error。
 * 仅由 npm run dev（根目录）经 dev:delayed 调用；单独 dev:web 不等待。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionPath = path.join(__dirname, '../../server/.runtime/session.json');
const DEFAULT_PORT = 39281;
const INTERVAL_MS = 300;
const MAX_WAIT_MS = 120_000;

function readSession() {
  try {
    return JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
  } catch {
    return { host: '127.0.0.1', port: DEFAULT_PORT };
  }
}

async function pingHealth() {
  const { host = '127.0.0.1', port = DEFAULT_PORT } = readSession();
  const url = `http://${host}:${port}/api/health`;
  const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
  return res.ok;
}

const started = Date.now();
process.stdout.write('[wait-api] 等待 API 服务…');

while (Date.now() - started < MAX_WAIT_MS) {
  try {
    if (await pingHealth()) {
      console.log(' 就绪');
      process.exit(0);
    }
  } catch {
    // 服务尚未 listen 或 initDb 中
  }
  process.stdout.write('.');
  await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
}

console.warn(
  `\n[wait-api] ${MAX_WAIT_MS / 1000}s 内未检测到 /api/health，仍继续启动 Vite。` +
    '若仅运行 dev:web，请先另开终端执行 npm run dev:server。'
);
process.exit(0);
