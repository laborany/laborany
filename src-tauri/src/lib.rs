/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     LaborAny Tauri 应用入口                              ║
 * ║                                                                          ║
 * ║  职责：管理 Sidecar 进程、数据库迁移、应用生命周期                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

#[cfg(not(debug_assertions))]
use tauri::Manager;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::process::CommandChild;
#[cfg(not(debug_assertions))]
use std::sync::Mutex;
use tauri_plugin_sql::{Migration, MigrationKind};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       Sidecar 进程状态管理                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
#[cfg(not(debug_assertions))]
struct ApiSidecar(Mutex<Option<CommandChild>>);

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       端口清理函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
#[cfg(not(debug_assertions))]
fn kill_existing_api_process(port: u16) {
    use std::process::Command;

    #[cfg(unix)]
    {
        if let Ok(output) = Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output()
        {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid in pids.lines() {
                if let Ok(pid_num) = pid.trim().parse::<i32>() {
                    println!("[API] Killing existing process on port {}: PID {}", port, pid_num);
                    let _ = Command::new("kill")
                        .args(["-9", &pid_num.to_string()])
                        .output();
                }
            }
        }
    }

    #[cfg(windows)]
    {
        if let Ok(output) = Command::new("netstat")
            .args(["-ano", "-p", "TCP"])
            .output()
        {
            let output_str = String::from_utf8_lossy(&output.stdout);
            for line in output_str.lines() {
                if line.contains(&format!(":{}", port)) && line.contains("LISTENING") {
                    if let Some(pid) = line.split_whitespace().last() {
                        println!("[API] Killing existing process on port {}: PID {}", port, pid);
                        let _ = Command::new("taskkill")
                            .args(["/F", "/PID", pid])
                            .output();
                    }
                }
            }
        }
    }

    std::thread::sleep(std::time::Duration::from_millis(500));
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       应用入口                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 数据库迁移定义
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_users_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    name TEXT NOT NULL,
                    balance REAL DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now'))
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_sessions_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    query TEXT NOT NULL,
                    status TEXT DEFAULT 'running',
                    cost REAL DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_messages_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    content TEXT,
                    tool_name TEXT,
                    tool_input TEXT,
                    tool_result TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (session_id) REFERENCES sessions(id)
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_files_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS files (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    path TEXT NOT NULL,
                    size INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_workflows_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS workflows (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    icon TEXT,
                    definition TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    is_public INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create_workflow_runs_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS workflow_runs (
                    id TEXT PRIMARY KEY,
                    workflow_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    status TEXT DEFAULT 'running',
                    input TEXT NOT NULL,
                    context TEXT,
                    current_step INTEGER DEFAULT 0,
                    total_steps INTEGER NOT NULL,
                    started_at TEXT DEFAULT (datetime('now')),
                    completed_at TEXT,
                    FOREIGN KEY (workflow_id) REFERENCES workflows(id),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
            "#,
            kind: MigrationKind::Up,
        },
    ];

    #[cfg(not(debug_assertions))]
    let api_sidecar = ApiSidecar(Mutex::new(None));

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:laborany.db", migrations)
                .build(),
        );

    #[cfg(not(debug_assertions))]
    {
        builder = builder.manage(api_sidecar);
    }

    builder
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            {
                const API_PORT: u16 = 3620;

                kill_existing_api_process(API_PORT);

                let sidecar_command = app.shell().sidecar("laborany-api")
                    .unwrap()
                    .env("PORT", API_PORT.to_string())
                    .env("NODE_ENV", "production");
                let (mut rx, child) = sidecar_command.spawn().expect("Failed to spawn API sidecar");

                if let Some(state) = app.try_state::<ApiSidecar>() {
                    if let Ok(mut guard) = state.0.lock() {
                        *guard = Some(child);
                    }
                }

                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_shell::process::CommandEvent;
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                println!("[API] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Stderr(line) => {
                                eprintln!("[API Error] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Error(error) => {
                                eprintln!("[API Spawn Error] {}", error);
                            }
                            CommandEvent::Terminated(status) => {
                                println!("[API] Process terminated with status: {:?}", status);
                                break;
                            }
                            _ => {}
                        }
                    }
                });
            }

            #[cfg(debug_assertions)]
            {
                let _ = app;
                println!("[Tauri Dev] API sidecar disabled. Run `pnpm dev:api` for the API server on port 3620.");
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                #[cfg(not(debug_assertions))]
                {
                    println!("[App] Cleaning up API sidecar...");
                    if let Some(state) = app_handle.try_state::<ApiSidecar>() {
                        if let Ok(mut guard) = state.0.lock() {
                            if let Some(child) = guard.take() as Option<CommandChild> {
                                println!("[App] Killing API sidecar process...");
                                let _ = child.kill();
                            }
                        }
                    }
                    kill_existing_api_process(3620);
                }
                #[cfg(debug_assertions)]
                {
                    let _ = app_handle;
                }
            }
        });
}
