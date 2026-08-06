/**
 * 桌面便携版：由 server.exe 托管 web/ 静态资源（避免 file:// 无法加载 ES module 导致白屏）
 */
import fs from 'fs';
import path from 'path';
import fastifyStatic from '@fastify/static';

export async function registerDesktopWebUi(app) {
  const webRoot = process.env.BA_WEB_ROOT?.trim();
  if (!webRoot) return;

  const indexPath = path.join(webRoot, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.warn(`[desktop-web] 未找到 index.html: ${indexPath}`);
    return;
  }

  await app.register(fastifyStatic, {
    root: webRoot,
    prefix: '/',
    decorateReply: true,
    index: ['index.html'],
  });
}
