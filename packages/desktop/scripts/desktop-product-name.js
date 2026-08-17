import fs from 'fs';
import path from 'path';
import { DESKTOP } from './desktop-build-paths.js';

/** 与 tauri.conf.json version 对齐，如 口袋BA_V1.0.4 */
export function readDesktopVersion() {
  const conf = JSON.parse(
    fs.readFileSync(path.join(DESKTOP, 'src-tauri/tauri.conf.json'), 'utf-8')
  );
  return String(conf.version ?? '0.0.0').trim();
}

export function readDesktopProductFolderName() {
  return `口袋BA_V${readDesktopVersion()}`;
}
