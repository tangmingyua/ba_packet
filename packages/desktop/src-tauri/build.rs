use std::fs;
use std::path::{Path, PathBuf};

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

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dist = manifest_dir.join("../../web/dist");
    if dist.exists() {
        rerun_if_changed_tree(&dist);
    }
    tauri_build::build();
}
