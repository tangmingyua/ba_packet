mod server;

use serde::Serialize;
use server::{api_base_url, start_server, uses_sidecar_web_ui, ServerProcess};
use std::sync::Mutex;
use tauri::{Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder};

struct AppState {
    server: Mutex<Option<ServerProcess>>,
}

#[derive(Serialize)]
struct ApiConfig {
    base: String,
    token: String,
}

#[tauri::command]
fn get_api_config(state: State<'_, AppState>) -> Result<ApiConfig, String> {
    let guard = state.server.lock().map_err(|error| error.to_string())?;
    let server = guard
        .as_ref()
        .ok_or_else(|| "本地服务尚未就绪".to_string())?;
    Ok(ApiConfig {
        base: api_base_url(),
        token: server.api_token.clone(),
    })
}

fn build_init_script(api_token: &str) -> String {
    let config = serde_json::json!({
        "base": api_base_url(),
        "token": api_token,
    });
    format!(
        "(function(){{var c={config};window.__BA_API_BASE__=c.base;window.__BA_API_TOKEN__=c.token;}})();"
    )
}

fn report_startup_error(message: &str) {
    eprintln!("{message}");
    #[cfg(windows)]
    unsafe {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        let text: Vec<u16> = OsStr::new(message)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let caption: Vec<u16> = OsStr::new("口袋BA")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        MessageBoxW(std::ptr::null_mut(), text.as_ptr(), caption.as_ptr(), 0x10);
    }
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn MessageBoxW(
        hwnd: *mut std::ffi::c_void,
        lptext: *const u16,
        lpcaption: *const u16,
        utype: u32,
    ) -> i32;
}

fn resolve_release_web_url() -> Result<WebviewUrl, String> {
    if uses_sidecar_web_ui() {
        let base = api_base_url();
        let url = format!("{base}/")
            .parse()
            .map_err(|error| format!("无法解析前端地址: {error}"))?;
        return Ok(WebviewUrl::External(url));
    }
    Ok(WebviewUrl::App("index.html".into()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            server: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![get_api_config])
        .setup(|app| {
            let server = match start_server(app.handle()) {
                Ok(server) => server,
                Err(error) => {
                    report_startup_error(&format!("启动失败：{error}"));
                    return Err(error.into());
                }
            };
            let init_script = build_init_script(&server.api_token);
            *app.state::<AppState>().server.lock().unwrap() = Some(server);

            let url = if cfg!(debug_assertions) {
                WebviewUrl::External(
                    "http://localhost:5173"
                        .parse()
                        .expect("invalid dev url"),
                )
            } else {
                resolve_release_web_url()?
            };

            WebviewWindowBuilder::new(app, "main", url)
                .title("口袋BA")
                .inner_size(1200.0, 800.0)
                .min_inner_size(900.0, 600.0)
                .use_https_scheme(false)
                .initialization_script(&init_script)
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                if let Some(state) = app.try_state::<AppState>() {
                    *state.server.lock().unwrap() = None;
                }
            }
        });
}
