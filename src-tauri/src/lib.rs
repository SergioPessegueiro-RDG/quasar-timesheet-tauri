// Deliberately thin. Every table, migration and query lives in TypeScript
// (src/lib/db/) and reaches SQLite through tauri-plugin-sql, so there are no
// custom commands here. Two reasons: the same query layer then runs unchanged
// against WASM SQLite in a plain browser during development, and this file
// almost never needs recompiling -- which matters because Windows machines with
// Smart App Control enabled cannot build Rust at all (see rust-toolchain.toml).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
