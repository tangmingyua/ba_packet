/**
 * 桌面 pkg 打包后的资源路径（wasm / sql 等外挂文件）
 */
import fs from 'fs';
import path from 'path';

export function packagedResourceDirs() {
  const dirs = [];
  if (process.env.BA_RESOURCES_PATH) {
    dirs.push(process.env.BA_RESOURCES_PATH);
  }
  if (process.pkg || process.sea) {
    dirs.push(path.dirname(process.execPath));
  }
  return dirs;
}

export function resolvePackagedFile(filenames) {
  const names = Array.isArray(filenames) ? filenames : [filenames];
  for (const dir of packagedResourceDirs()) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}
