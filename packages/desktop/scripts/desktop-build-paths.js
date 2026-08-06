import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DESKTOP = path.resolve(__dirname, '..');
export const ROOT = path.resolve(DESKTOP, '../..');
/** 桌面打包专用前端产物（与 packages/web/dist 开发构建隔离） */
export const WEB_DIST = path.join(DESKTOP, 'build/web-dist');
export const RELEASE = path.join(DESKTOP, 'src-tauri/target/release');
export const FRONTEND_STAMP = path.join(DESKTOP, 'src-tauri/.frontend-dist.sha256');

export function resolveBuildStamp() {
  const fromEnv = process.env.BA_DESKTOP_BUILD_STAMP?.trim();
  if (fromEnv) return fromEnv;
  return new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
}

export function portableBuildRoot(stamp = resolveBuildStamp()) {
  return path.join(RELEASE, 'portable-builds', stamp);
}
