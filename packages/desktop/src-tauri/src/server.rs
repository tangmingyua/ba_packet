use std::fs;

use std::io::{Read, Write};

use std::net::{SocketAddr, TcpStream};

use std::path::{Path, PathBuf};

use std::process::{Child, Command, Stdio};

use std::thread;

use std::time::{Duration, Instant};



use tauri::{AppHandle, Manager};



const PORT: u16 = 39281;



struct RuntimePaths {

    server_exe: PathBuf,

    resources_dir: PathBuf,

    seed_db: PathBuf,

    dev_node: PathBuf,

    dev_server_entry: PathBuf,

    dev_node_modules: PathBuf,

    use_dev_node: bool,

}



pub struct ServerProcess {

    child: Child,

    pub api_token: String,

}



impl Drop for ServerProcess {

    fn drop(&mut self) {

        let _ = self.child.kill();

    }

}



fn monorepo_root() -> PathBuf {

    PathBuf::from(env!("CARGO_MANIFEST_DIR"))

        .join("../..")

        .join("..")

        .canonicalize()

        .expect("failed to resolve monorepo root")

}



fn random_hex(byte_len: usize) -> Result<String, String> {

    let mut bytes = vec![0u8; byte_len];

    getrandom::getrandom(&mut bytes).map_err(|error| error.to_string())?;

    Ok(bytes.iter().map(|byte| format!("{:02x}", byte)).collect())

}



fn resolve_seed_path(resource_dir: &Path) -> PathBuf {

    let enc = resource_dir.join("seed").join("catalog.db.enc");

    if enc.exists() {

        return enc;

    }

    resource_dir.join("seed").join("catalog.db")

}



fn runtime_paths(app: &AppHandle) -> Result<RuntimePaths, String> {

    if cfg!(debug_assertions) {

        let root = monorepo_root();

        let seed_db = {

            let enc = root.join("packages/server/data/catalog.db.enc");

            if enc.exists() {

                enc

            } else {

                root.join("packages/server/data/catalog.db")

            }

        };

        Ok(RuntimePaths {

            server_exe: PathBuf::new(),

            resources_dir: PathBuf::new(),

            seed_db,

            dev_node: PathBuf::from("node"),

            dev_server_entry: root.join("packages/server/src/index.js"),

            dev_node_modules: root.join("packages/desktop/bundle/resources/node_modules"),

            use_dev_node: true,

        })

    } else {

        let resource_dir = app

            .path()

            .resource_dir()

            .map_err(|error| error.to_string())?;



        Ok(RuntimePaths {

            server_exe: resource_dir.join("server.exe"),

            resources_dir: resource_dir.clone(),

            seed_db: resolve_seed_path(&resource_dir),

            dev_node: PathBuf::new(),

            dev_server_entry: PathBuf::new(),

            dev_node_modules: PathBuf::new(),

            use_dev_node: false,

        })

    }

}



fn ensure_user_database(app_data_dir: &Path) -> Result<PathBuf, String> {

    let db_dir = app_data_dir.join("data");

    fs::create_dir_all(&db_dir).map_err(|error| error.to_string())?;

    Ok(db_dir.join("catalog.db"))

}



fn ensure_db_key(app_data_dir: &Path) -> Result<String, String> {

    let secure_dir = app_data_dir.join("secure");

    fs::create_dir_all(&secure_dir).map_err(|error| error.to_string())?;



    let hex_path = secure_dir.join("db-key.hex");

    if hex_path.exists() {

        return fs::read_to_string(&hex_path)

            .map(|value| value.trim().to_string())

            .map_err(|error| error.to_string());

    }



    let key = random_hex(32)?;

    fs::write(&hex_path, &key).map_err(|error| error.to_string())?;

    Ok(key)

}



fn verify_server_auth(port: u16, token: &str) -> Result<(), String> {

    let mut stream = TcpStream::connect(format!("127.0.0.1:{port}"))

        .map_err(|error| error.to_string())?;

    stream

        .set_read_timeout(Some(Duration::from_secs(3)))

        .map_err(|error| error.to_string())?;

    stream

        .set_write_timeout(Some(Duration::from_secs(3)))

        .map_err(|error| error.to_string())?;



    let request = format!(

        "GET /api/dataset/catalog HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nConnection: close\r\n\r\n"

    );

    stream

        .write_all(request.as_bytes())

        .map_err(|error| error.to_string())?;



    let mut response = vec![0u8; 1024];

    let read = stream.read(&mut response).map_err(|error| error.to_string())?;

    let text = String::from_utf8_lossy(&response[..read]);

    if text.contains("HTTP/1.1 200") || text.contains("HTTP/1.0 200") {

        return Ok(());

    }



    Err(format!(

        "端口 {port} 上的本地服务令牌不匹配，可能被旧进程占用"

    ))

}



fn wait_for_server(child: &mut Child, port: u16, token: &str, timeout_ms: u64) -> Result<(), String> {

    let addr: SocketAddr = format!("127.0.0.1:{port}")

        .parse::<SocketAddr>()

        .map_err(|error| error.to_string())?;

    let started = Instant::now();



    loop {

        if let Ok(Some(status)) = child.try_wait() {

            return Err(format!("本地服务异常退出: {status}"));

        }



        if TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok() {

            return verify_server_auth(port, token);

        }



        if started.elapsed() > Duration::from_millis(timeout_ms) {

            return Err("本地服务启动超时".into());

        }



        thread::sleep(Duration::from_millis(300));

    }

}



#[cfg(windows)]

fn kill_process_listening_on_port(port: u16) {

    let script = format!(

        "$p = Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($p) {{ $p | ForEach-Object {{ Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }} }}"

    );

    let _ = Command::new("powershell")

        .args(["-NoProfile", "-NonInteractive", "-Command", &script])

        .stdout(Stdio::null())

        .stderr(Stdio::null())

        .status();

}



#[cfg(not(windows))]

fn kill_process_listening_on_port(_port: u16) {}



fn spawn_server(

    paths: &RuntimePaths,

    db_path: &Path,

    db_key: &str,

    api_token: &str,

    session_path: &Path,

) -> Result<Child, String> {

    let seed_path = if db_path.exists() {

        String::new()

    } else if paths.seed_db.exists() {

        paths.seed_db.to_string_lossy().to_string()

    } else {

        return Err(format!("未找到预置数据库: {}", paths.seed_db.display()));

    };



    if let Some(parent) = session_path.parent() {

        fs::create_dir_all(parent).map_err(|error| error.to_string())?;

    }



    let mut command = if paths.use_dev_node {

        if !paths.dev_server_entry.exists() {

            return Err(format!(

                "未找到服务端入口: {}",

                paths.dev_server_entry.display()

            ));

        }

        let mut cmd = Command::new(&paths.dev_node);

        cmd.arg(&paths.dev_server_entry);

        if paths.dev_node_modules.exists() {

            cmd.env("NODE_PATH", &paths.dev_node_modules);

        }

        cmd

    } else {

        if !paths.server_exe.exists() {

            return Err(format!(

                "未找到 server.exe: {}，请先执行 npm run predist:win",

                paths.server_exe.display()

            ));

        }

        Command::new(&paths.server_exe)

    };



    command

        .env("BA_DB_PATH", db_path)

        .env("BA_DB_KEY", db_key)

        .env("BA_SEED_PATH", seed_path)

        .env("BA_API_TOKEN", api_token)

        .env("BA_PORT", PORT.to_string())

        .env("BA_HOST", "127.0.0.1")

        .env("BA_RUNTIME_SESSION_PATH", session_path);



    if !paths.use_dev_node {

        command.env("BA_RESOURCES_PATH", &paths.resources_dir);

    }



    command.stdout(Stdio::piped()).stderr(Stdio::piped());



    #[cfg(windows)]

    {

        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x08000000;

        command.creation_flags(CREATE_NO_WINDOW);

    }



    command.spawn().map_err(|error| error.to_string())

}



fn launch_server(

    paths: &RuntimePaths,

    db_path: &Path,

    db_key: &str,

    api_token: &str,

    session_path: &Path,

) -> Result<ServerProcess, String> {

    let mut child = spawn_server(paths, db_path, db_key, api_token, session_path)?;

    if wait_for_server(&mut child, PORT, api_token, 30_000).is_err() {

        let _ = child.kill();

        kill_process_listening_on_port(PORT);

        thread::sleep(Duration::from_millis(800));

        let mut child = spawn_server(paths, db_path, db_key, api_token, session_path)?;

        wait_for_server(&mut child, PORT, api_token, 30_000)?;

        return Ok(ServerProcess {

            child,

            api_token: api_token.to_string(),

        });

    }



    Ok(ServerProcess {

        child,

        api_token: api_token.to_string(),

    })

}



fn resolve_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            if exe_dir.join("portable.flag").exists() {
                let portable_dir = exe_dir.join("app-data");
                fs::create_dir_all(&portable_dir).map_err(|error| error.to_string())?;
                return Ok(portable_dir);
            }
        }
    }

    app.path()
        .app_data_dir()
        .map_err(|error| error.to_string())
}

pub fn start_server(app: &AppHandle) -> Result<ServerProcess, String> {

    let paths = runtime_paths(app)?;

    let app_data_dir = resolve_app_data_dir(app)?;

    let db_path = ensure_user_database(&app_data_dir)?;

    let db_key = ensure_db_key(&app_data_dir)?;

    let session_path = app_data_dir.join("runtime").join("session.json");

    let api_token = random_hex(32)?;

    launch_server(

        &paths,

        &db_path,

        &db_key,

        &api_token,

        &session_path,

    )

}



pub fn api_base_url() -> String {

    format!("http://127.0.0.1:{PORT}")

}


