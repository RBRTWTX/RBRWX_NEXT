use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

#[derive(Default)]
struct CanvasBridgeInner {
    revision: u64,
    state: Option<Value>,
    operator_actions: Vec<String>,
}

#[derive(Default)]
struct CanvasBridgeState(Mutex<CanvasBridgeInner>);

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

#[tauri::command]
fn set_canvas_state(
    bridge: State<'_, CanvasBridgeState>,
    state: Value,
) -> Result<u64, String> {
    let mut inner = bridge.0.lock()
        .map_err(|_| "canvas bridge state lock poisoned".to_string())?;
    inner.revision = inner.revision.wrapping_add(1).max(1);
    inner.state = Some(state);
    Ok(inner.revision)
}

#[tauri::command]
fn get_canvas_state(
    bridge: State<'_, CanvasBridgeState>,
    after_revision: u64,
) -> Result<Value, String> {
    let inner = bridge.0.lock()
        .map_err(|_| "canvas bridge state lock poisoned".to_string())?;
    let state = if inner.revision > after_revision {
        inner.state.clone()
    } else {
        None
    };
    Ok(json!({ "revision": inner.revision, "state": state }))
}

#[tauri::command]
fn request_operator_action(
    bridge: State<'_, CanvasBridgeState>,
    action: String,
) -> Result<(), String> {
    const ALLOWED: [&str; 6] = ["previous", "play-pause", "next", "loop", "refresh", "hide-menu"];
    if !ALLOWED.contains(&action.as_str()) {
        return Err(format!("unsupported operator action: {action}"));
    }
    let mut inner = bridge.0.lock()
        .map_err(|_| "canvas bridge state lock poisoned".to_string())?;
    if inner.operator_actions.len() >= 32 {
        inner.operator_actions.remove(0);
    }
    inner.operator_actions.push(action);
    Ok(())
}

#[tauri::command]
fn take_operator_actions(bridge: State<'_, CanvasBridgeState>) -> Result<Vec<String>, String> {
    let mut inner = bridge.0.lock()
        .map_err(|_| "canvas bridge state lock poisoned".to_string())?;
    Ok(inner.operator_actions.drain(..).collect())
}

#[tauri::command]
async fn open_canvas_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("rbrwx-canvas") {
        window.show().map_err(|error| format!("unable to show canvas window: {error}"))?;
        window.set_focus().map_err(|error| format!("unable to focus canvas window: {error}"))?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        "rbrwx-canvas",
        WebviewUrl::App("index.html".into()),
    )
    .initialization_script("window.__RBRWX_CANVAS__ = true;")
    .title("RBRWX Canvas")
    .inner_size(1280.0, 720.0)
    .min_inner_size(640.0, 360.0)
    .resizable(true)
    .decorations(true)
    .build()
    .map(|_| ())
    .map_err(|error| format!("unable to open RBRWX Canvas window: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CanvasBridgeState::default())
        .invoke_handler(tauri::generate_handler![
            runtime_contract,
            report_map_health,
            set_canvas_state,
            get_canvas_state,
            request_operator_action,
            take_operator_actions,
            open_canvas_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RBRWX NEXT");
}
