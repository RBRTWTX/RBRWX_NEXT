use serde_json::json;

#[tauri::command]
fn runtime_contract() -> &'static str {
    "rbrwx-next/0.1.0/broadcast-map-foundation"
}

#[tauri::command]
fn report_map_health(health: String, message: String) -> Result<(), String> {
    let Ok(path) = std::env::var("RBRWX_HEALTH_FILE") else {
        return Ok(());
    };

    let payload = json!({
        "contract": runtime_contract(),
        "health": health,
        "message": message,
    });

    std::fs::write(path, payload.to_string())
        .map_err(|error| format!("unable to write runtime health marker: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![runtime_contract, report_map_health])
        .run(tauri::generate_context!())
        .expect("error while running RBRWX NEXT");
}
