import fs from 'fs';
import { WEB_DIST } from './desktop-build-paths.js';

if (fs.existsSync(WEB_DIST)) {
  fs.rmSync(WEB_DIST, { recursive: true, force: true });
  console.log(`[clean-desktop-web] 已清空: ${WEB_DIST}`);
}
