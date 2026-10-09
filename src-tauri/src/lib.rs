use serde::Serialize;
use serde_json::{json, Value};
use std::{path::{Component, Path, PathBuf}, sync::Mutex};
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

#[derive(Serialize)]
struct GraphicAssetEntry {
    path: String,
    name: String,
    kind: String,
}

fn find_project_root() -> Result<PathBuf, String> {
    if let Ok(value) = std::env::var("RBRWX_PROJECT_ROOT") {
        let root = PathBuf::from(value);
        if root.join("asset-library").is_dir() {
            return Ok(root);
        }
    }

    let mut starts = Vec::new();
    if let Ok(current) = std::env::current_dir() { starts.push(current); }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() { starts.push(parent.to_path_buf()); }
    }

    for start in starts {
        for candidate in start.ancestors() {
            if candidate.join("asset-library").is_dir() && candidate.join("package.json").is_file() {
                return Ok(candidate.to_path_buf());
            }
        }
    }
    Err("RBRWX project asset-library folder was not found. Run from the project tree or set RBRWX_PROJECT_ROOT.".to_string())
}

fn checked_asset_path(relative_path: &str) -> Result<(PathBuf, String), String> {
    let relative = Path::new(relative_path);
    if relative.is_absolute() { return Err("asset path must be relative".to_string()); }
    let parts: Vec<String> = relative.components().map(|part| match part {
        Component::Normal(value) => Ok(value.to_string_lossy().to_string()),
        _ => Err("asset path contains an unsafe component".to_string()),
    }).collect::<Result<Vec<_>, _>>()?;
    if parts.len() != 2 { return Err("asset path must be png/<file> or svg/<file>".to_string()); }
    let kind = parts[0].to_ascii_lowercase();
    if kind != "png" && kind != "svg" { return Err("asset path must use png or svg library".to_string()); }
    let extension = Path::new(&parts[1]).extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    if extension != kind { return Err("asset extension does not match library folder".to_string()); }
    let root = find_project_root()?.join("asset-library");
    Ok((root.join(&parts[0]).join(&parts[1]), kind))
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    let mut index = 0;
    while index < bytes.len() {
        let a = bytes[index] as u32;
        let b = if index + 1 < bytes.len() { bytes[index + 1] as u32 } else { 0 };
        let c = if index + 2 < bytes.len() { bytes[index + 2] as u32 } else { 0 };
        let triple = (a << 16) | (b << 8) | c;
        out.push(TABLE[((triple >> 18) & 0x3f) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3f) as usize] as char);
        if index + 1 < bytes.len() { out.push(TABLE[((triple >> 6) & 0x3f) as usize] as char); } else { out.push('='); }
        if index + 2 < bytes.len() { out.push(TABLE[(triple & 0x3f) as usize] as char); } else { out.push('='); }
        index += 3;
    }
    out
}

fn svg_is_safe(bytes: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(bytes) else { return false; };
    let lower = text.to_ascii_lowercase();
    let blocked = [
        "<script", "<foreignobject", "javascript:", "onload=", "onerror=", "onclick=", "onmouseover=",
        "href=\"http", "href='http", "xlink:href=\"http", "xlink:href='http", "url(http", "url('http", "url(\"http",
    ];
    lower.contains("<svg") && !blocked.iter().any(|token| lower.contains(token))
}

#[tauri::command]
fn list_graphic_assets() -> Result<Vec<GraphicAssetEntry>, String> {
    let root = find_project_root()?.join("asset-library");
    let mut out = Vec::new();
    for kind in ["png", "svg"] {
        let folder = root.join(kind);
        if !folder.is_dir() { continue; }
        let entries = std::fs::read_dir(&folder).map_err(|error| format!("unable to read {} asset library: {error}", kind))?;
        for entry in entries {
            let entry = entry.map_err(|error| format!("unable to read asset entry: {error}"))?;
            let path = entry.path();
            if !path.is_file() { continue; }
            let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
            if extension != kind { continue; }
            let name = entry.file_name().to_string_lossy().to_string();
            out.push(GraphicAssetEntry { path: format!("{kind}/{name}"), name, kind: kind.to_string() });
        }
    }
    out.sort_by(|a, b| a.path.to_ascii_lowercase().cmp(&b.path.to_ascii_lowercase()));
    Ok(out)
}

#[tauri::command]
fn read_graphic_asset(relative_path: String) -> Result<String, String> {
    let (path, kind) = checked_asset_path(&relative_path)?;
    let metadata = std::fs::metadata(&path).map_err(|error| format!("unable to read asset metadata: {error}"))?;
    if !metadata.is_file() { return Err("asset is not a file".to_string()); }
    if metadata.len() > 15 * 1024 * 1024 { return Err("asset exceeds 15 MB limit".to_string()); }
    let bytes = std::fs::read(&path).map_err(|error| format!("unable to read asset: {error}"))?;
    if kind == "png" {
        if !bytes.starts_with(&[137, 80, 78, 71, 13, 10, 26, 10]) { return Err("PNG asset has an invalid signature".to_string()); }
        return Ok(format!("data:image/png;base64,{}", base64_encode(&bytes)));
    }
    if !svg_is_safe(&bytes) { return Err("SVG asset contains unsupported active or external content".to_string()); }
    Ok(format!("data:image/svg+xml;base64,{}", base64_encode(&bytes)))
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
    let allowed: Vec<String> = serde_json::from_str(include_str!("../../src/broadcast-host/operatorCommands.json")).map_err(|e| e.to_string())?;
    let seek = action.strip_prefix("seek:").and_then(|s| s.parse::<usize>().ok()).is_some_and(|n| n < 1000);
    let site = action.strip_prefix("radar-site:").is_some_and(|s| s.len() == 4 && s.bytes().all(|b| b.is_ascii_alphanumeric()));
    let speed = action.strip_prefix("speed:").and_then(|value| value.parse::<f64>().ok()).is_some_and(|value| value.is_finite() && (1.0..=150.0).contains(&value));
    let color = action.strip_prefix("color:#").is_some_and(|value| value.len() == 6 && value.bytes().all(|b| b.is_ascii_hexdigit()));
    if action.len() > 80 || !(allowed.contains(&action) || speed || color || seek || site) {
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
fn canvas_window_open(app: tauri::AppHandle) -> bool { app.get_webview_window("rbrwx-canvas").is_some() }

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
            list_graphic_assets,
            read_graphic_asset,
            set_canvas_state,
            get_canvas_state,
            request_operator_action,
            take_operator_actions,
            open_canvas_window,
            canvas_window_open,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RBRWX NEXT");
}
