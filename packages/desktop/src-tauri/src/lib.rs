mod server;

use serde::Serialize;
use server::{api_base_url, start_server, ServerProcess};
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            server: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![get_api_config])
        .setup(|app| {
            let server = start_server(app.handle())?;
            let init_script = build_init_script(&server.api_token);
            *app.state::<AppState>().server.lock().unwrap() = Some(server);

            let url = if cfg!(debug_assertions) {
                WebviewUrl::External(
                    "http://localhost:5173"
                        .parse()
                        .expect("invalid dev url"),
                )
            } else {
                WebviewUrl::App("index.html".into())
            };

            WebviewWindowBuilder::new(app, "main", url)
                .title("监管资料库搜索")
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
