/**
 * 桌面版启动时同步 API 地址与令牌（Tauri invoke 比 init script 更可靠）
 */
export async function bootstrapDesktopApi() {
  const tauri = window.__TAURI__;
  const invoke = tauri?.core?.invoke ?? tauri?.invoke;
  if (typeof invoke !== 'function') return;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const config = await invoke('get_api_config');
      if (config?.base) window.__BA_API_BASE__ = config.base;
      if (config?.token) window.__BA_API_TOKEN__ = config.token;
      if (config?.token) return;
    } catch (error) {
      if (attempt === 7) {
        console.warn('[desktop] 获取 API 配置失败', error);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
