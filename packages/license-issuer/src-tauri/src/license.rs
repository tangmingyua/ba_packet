use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{SecondsFormat, Utc};
use ed25519_dalek::pkcs8::spki::der::pem::LineEnding;
use ed25519_dalek::pkcs8::spki::EncodePublicKey;
use ed25519_dalek::pkcs8::{DecodePrivateKey, EncodePrivateKey};
use ed25519_dalek::{Signer, SigningKey};
use rand_core::OsRng;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// 与 packages/server/src/license/public-key.js 保持一致。
const EMBEDDED_PUBLIC_KEY_PEM: &str = "-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAHRroMI+a1nqc1hb8rL0DXRvmuJmSmjDWeG8PFg41uFs=
-----END PUBLIC KEY-----
";

const BUNDLED_PRIVATE_KEY: &str = include_str!(concat!(env!("OUT_DIR"), "/bundled_private.pem"));
const LICENSE_PREFIX: &str = "BA1";

#[derive(Serialize)]
struct LicensePayload<'a> {
    v: u8,
    #[serde(rename = "machineId")]
    machine_id: &'a str,
    #[serde(rename = "issuedAt")]
    issued_at: &'a str,
}

pub struct KeyStatus {
    pub fingerprint: String,
    pub matches_app: bool,
}

pub fn normalize_machine_id(id: &str) -> String {
    id.chars()
        .filter(|ch| ch.is_ascii_hexdigit())
        .map(|ch| ch.to_ascii_lowercase())
        .collect()
}

fn canonical_payload(machine_id: &str, issued_at: &str) -> Result<String, String> {
    serde_json::to_string(&LicensePayload {
        v: 1,
        machine_id,
        issued_at,
    })
    .map_err(|error| error.to_string())
}

fn signing_key_from_pem(private_key_pem: &str) -> Result<SigningKey, String> {
    SigningKey::from_pkcs8_pem(private_key_pem).map_err(|error| format!("无法读取私钥: {error}"))
}

fn public_key_fingerprint_from_verifying(verifying: &ed25519_dalek::VerifyingKey) -> Result<String, String> {
    let der = verifying
        .to_public_key_der()
        .map_err(|error| format!("无法导出公钥: {error}"))?;
    let digest = Sha256::digest(der.as_bytes());
    Ok(digest
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<String>()
        .chars()
        .take(16)
        .collect())
}

pub fn public_key_fingerprint_pem(public_key_pem: &str) -> Result<String, String> {
    use ed25519_dalek::pkcs8::spki::DecodePublicKey;
    let verifying = ed25519_dalek::VerifyingKey::from_public_key_pem(public_key_pem)
        .map_err(|error| format!("无法解析公钥: {error}"))?;
    public_key_fingerprint_from_verifying(&verifying)
}

fn generate_private_key_pem() -> Result<String, String> {
    let signing_key = SigningKey::generate(&mut OsRng);
    signing_key
        .to_pkcs8_pem(LineEnding::LF)
        .map(|pem| pem.to_string())
        .map_err(|error| format!("无法生成私钥: {error}"))
}

pub fn key_status(private_key_pem: &str) -> Result<KeyStatus, String> {
    let signing_key = signing_key_from_pem(private_key_pem)?;
    let fingerprint = public_key_fingerprint_from_verifying(&signing_key.verifying_key())?;
    let embedded = public_key_fingerprint_pem(EMBEDDED_PUBLIC_KEY_PEM)?;
    Ok(KeyStatus {
        matches_app: fingerprint == embedded,
        fingerprint,
    })
}

pub fn issue_license_code(private_key_pem: &str, machine_id: &str) -> Result<String, String> {
    let machine_id = normalize_machine_id(machine_id);
    if machine_id.is_empty() {
        return Err("请填写机器码".to_string());
    }
    let issued_at = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    issue_license_code_at(private_key_pem, &machine_id, &issued_at)
}

fn issue_license_code_at(
    private_key_pem: &str,
    machine_id: &str,
    issued_at: &str,
) -> Result<String, String> {
    let signing_key = signing_key_from_pem(private_key_pem)?;
    let payload = canonical_payload(machine_id, issued_at)?;
    let signature = signing_key.sign(payload.as_bytes());
    let body = URL_SAFE_NO_PAD.encode(payload.as_bytes());
    let sig = URL_SAFE_NO_PAD.encode(signature.to_bytes());
    Ok(format!("{LICENSE_PREFIX}.{body}.{sig}"))
}

fn user_private_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法定位用户目录: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建用户目录: {error}"))?;
    Ok(dir.join("ed25519-private.pem"))
}

pub fn load_or_create_private_key(app: &AppHandle) -> Result<String, String> {
    let user_path = user_private_key_path(app)?;
    if user_path.exists() {
        return fs::read_to_string(&user_path).map_err(|error| format!("无法读取私钥: {error}"));
    }

    let bundled = BUNDLED_PRIVATE_KEY.trim();
    let pem = if !bundled.is_empty() {
        format!("{bundled}\n")
    } else {
        generate_private_key_pem()?
    };
    fs::write(&user_path, &pem).map_err(|error| format!("无法保存私钥: {error}"))?;
    Ok(pem)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_dashes() {
        assert_eq!(
            normalize_machine_id("A1B2C3D4-E5F60718"),
            "a1b2c3d4e5f60718"
        );
    }

    #[test]
    fn payload_json_is_compact_and_ordered() {
        let json = canonical_payload("abc", "2026-08-17T02:00:00.000Z").unwrap();
        assert_eq!(json, r#"{"v":1,"machineId":"abc","issuedAt":"2026-08-17T02:00:00.000Z"}"#);
    }

    #[test]
    fn rust_signature_verifies_with_matching_key() {
        let pem = generate_private_key_pem().unwrap();
        let code = issue_license_code_at(&pem, "aabbccdd", "2026-08-17T02:00:00.000Z").unwrap();
        assert!(code.starts_with("BA1."));
        let parts: Vec<_> = code.split('.').collect();
        assert_eq!(parts.len(), 3);
    }

    #[test]
    fn bundled_key_matches_app_public_key() {
        let pem = BUNDLED_PRIVATE_KEY.trim();
        if pem.is_empty() {
            return;
        }
        let status = key_status(pem).expect("parse bundled key");
        assert!(
            status.matches_app,
            "bundled private key fingerprint {} does not match app public key",
            status.fingerprint
        );
    }

    #[test]
    fn node_verifier_accepts_rust_issued_code() {
        let pem = BUNDLED_PRIVATE_KEY.trim();
        if pem.is_empty() {
            return;
        }
        let code = issue_license_code(pem, "aabbccddeeff00112233445566778899").unwrap();
        let script = concat!(env!("CARGO_MANIFEST_DIR"), "/../scripts/verify-code.mjs");
        let output = std::process::Command::new("node")
            .arg(script)
            .arg(&code)
            .output()
            .expect("run node verifier");
        assert!(
            output.status.success(),
            "node verifier failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}
