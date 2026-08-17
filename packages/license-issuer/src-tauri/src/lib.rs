mod license;

use license::{issue_license_code, key_status, load_or_create_private_key};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
struct LicenseStatusDto {
    fingerprint: String,
    #[serde(rename = "matchesApp")]
    matches_app: bool,
}

#[derive(Serialize)]
struct IssueDto {
    code: String,
}

#[tauri::command]
fn license_status(app: AppHandle) -> Result<LicenseStatusDto, String> {
    let pem = load_or_create_private_key(&app)?;
    let status = key_status(&pem)?;
    Ok(LicenseStatusDto {
        fingerprint: status.fingerprint,
        matches_app: status.matches_app,
    })
}

#[tauri::command]
fn license_issue(app: AppHandle, machine_id: String) -> Result<IssueDto, String> {
    let pem = load_or_create_private_key(&app)?;
    Ok(IssueDto {
        code: issue_license_code(&pem, &machine_id)?,
    })
}

#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|error| error.to_string())?;
    clipboard
        .set_text(text)
        .map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            license_status,
            license_issue,
            copy_text
        ])
        .setup(|app| {
            let _ = load_or_create_private_key(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running license issuer");
}
