use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let pem_src = manifest_dir.join("../keys/private.pem");
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let pem_out = out_dir.join("bundled_private.pem");
    let profile = env::var("PROFILE").unwrap_or_default();

    if pem_src.exists() {
        fs::copy(&pem_src, &pem_out).expect("copy bundled private key");
    } else if profile == "release" {
        panic!(
            "缺少发卡私钥: {}。打包前请把 private.pem 放到 packages/license-issuer/keys/",
            pem_src.display()
        );
    } else {
        fs::write(&pem_out, "").expect("write empty bundled private key");
    }

    println!("cargo:rerun-if-changed={}", pem_src.display());
    let ui = manifest_dir.join("../ui");
    if ui.exists() {
        rerun_if_changed_tree(&ui);
    }
    tauri_build::build();
}

fn rerun_if_changed_tree(dir: &Path) {
    let Ok(read_dir) = fs::read_dir(dir) else {
        return;
    };
    for entry in read_dir.flatten() {
        let path = entry.path();
        if path.is_dir() {
            rerun_if_changed_tree(&path);
        } else if path.is_file() {
            println!("cargo:rerun-if-changed={}", path.display());
        }
    }
}
