/**
 * 本地 API 鉴权：防止本机其他进程直接调用 /api/*
 * 令牌由环境变量 BA_API_TOKEN 注入，未设置时在进程内自动生成
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let apiToken = '';

export function ensureApiToken() {
  if (process.env.BA_API_TOKEN) {
    apiToken = process.env.BA_API_TOKEN;
    return apiToken;
  }
  if (!apiToken) {
    apiToken = crypto.randomBytes(32).toString('hex');
    process.env.BA_API_TOKEN = apiToken;
  }
  return apiToken;
}

export function getApiToken() {
  return apiToken || ensureApiToken();
}

export function getRuntimeSessionPath() {
  if (process.env.BA_RUNTIME_SESSION_PATH) {
    return process.env.BA_RUNTIME_SESSION_PATH;
  }
  return path.join(__dirname, '../.runtime/session.json');
}

export function writeRuntimeSession({ host, port }) {
  const sessionPath = getRuntimeSessionPath();
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(
    sessionPath,
    JSON.stringify(
      {
        host,
        port,
        token: getApiToken(),
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf-8'
  );
}

export function readRuntimeSession() {
  try {
    return JSON.parse(fs.readFileSync(getRuntimeSessionPath(), 'utf-8'));
  } catch {
    return null;
  }
}

function isAllowedOrigin(origin) {
  if (!origin || origin === 'null') return true;
  if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(origin)) {
    return true;
  }
  // 桌面版 file:// 或 Tauri 自定义协议加载页面
  if (/^(file|app|tauri):/i.test(origin)) return true;
  if (/^https?:\/\/tauri\.localhost(:\d+)?$/i.test(origin)) return true;
  // Vite dev server 绑定 0.0.0.0 时，可能通过局域网 IP 访问
  if (/^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/i.test(origin)) return true;
  return false;
}

export function registerLocalApiAuth(app) {
  ensureApiToken();

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0];
    if (pathname === '/api/health') return;
    if (!pathname.startsWith('/api/')) return;

    const auth = request.headers.authorization || '';
    if (auth !== `Bearer ${getApiToken()}`) {
      return reply.code(401).send({ message: '未授权访问' });
    }
  });
}

export function getCorsOptions() {
  return {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
}
