// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;
use std::sync::Mutex;

// State management
struct AppState {
    data_dir: Mutex<Option<PathBuf>>,
    _todos_dir: Mutex<Option<PathBuf>>,
    _docs_dir: Mutex<Option<PathBuf>>,
}

// Data structures
#[derive(Debug, Serialize, Deserialize)]
struct Note {
    id: String,
    path: String,
    name: String,
    #[serde(rename = "type")]
    note_type: String,
    children: Option<Vec<Note>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified: Option<i64>,
}



// Commands
#[tauri::command]
async fn get_meta_data_path(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let data_dir = state.data_dir.lock().unwrap();
    Ok(data_dir.as_ref().map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
async fn set_meta_data_path(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut data_dir = state.data_dir.lock().unwrap();
    *data_dir = Some(PathBuf::from(path));
    Ok(())
}

#[tauri::command]
async fn pick_folder() -> Result<Option<String>, String> {
    // This will be called from the frontend using the Tauri dialog plugin
    Err("Use Tauri dialog plugin directly from frontend".to_string())
}

#[tauri::command]
async fn read_notes(
    docs_dir: String,
    _state: State<'_, AppState>,
) -> Result<Vec<Note>, String> {
    let path = PathBuf::from(docs_dir);
    read_docs_tree(&path, "")
        .map_err(|e| format!("Failed to read notes: {}", e))
}

fn read_docs_tree(dir_path: &Path, relative_path: &str) -> Result<Vec<Note>, std::io::Error> {
    let mut notes = Vec::new();
    
    if !dir_path.exists() {
        return Ok(notes);
    }

    let entries = fs::read_dir(dir_path)?;
    
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        
        // Skip hidden files
        if file_name.starts_with('.') {
            continue;
        }
        
        let relative_file_path = if relative_path.is_empty() {
            file_name.clone()
        } else {
            format!("{}/{}", relative_path, file_name)
        };
        
        let metadata = entry.metadata()?;
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64);
        
        if metadata.is_dir() {
            let children = read_docs_tree(&path, &relative_file_path)?;
            notes.push(Note {
                id: format!("folder:{}", relative_file_path),
                path: relative_file_path,
                name: file_name,
                note_type: "folder".to_string(),
                children: Some(children),
                modified,
            });
        } else if is_markdown_file(&file_name) {
            notes.push(Note {
                id: relative_file_path.clone(),
                path: relative_file_path,
                name: file_name,
                note_type: "file".to_string(),
                children: None,
                modified,
            });
        }
    }
    
    Ok(notes)
}

fn is_markdown_file(filename: &str) -> bool {
    filename.ends_with(".md") || 
    filename.ends_with(".html") || 
    filename.ends_with(".mhtml") || 
    filename.ends_with(".txt")
}

#[tauri::command]
async fn read_file_content(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
async fn write_file_content(file_path: String, content: String) -> Result<(), String> {
    // Atomic write: write to temp file first, then rename
    let temp_path = format!("{}.tmp", file_path);
    fs::write(&temp_path, content)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    fs::rename(&temp_path, &file_path)
        .map_err(|e| format!("Failed to rename file: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn create_note(
    docs_dir: String,
    target_path: String,
    file_name: String,
) -> Result<String, String> {
    let full_path = PathBuf::from(&docs_dir).join(&target_path).join(&file_name);
    
    if full_path.exists() {
        return Err("File already exists".to_string());
    }
    
    // Create parent directory if needed
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    
    // Create empty file
    fs::write(&full_path, "")
        .map_err(|e| format!("Failed to create file: {}", e))?;
    
    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn create_folder(
    docs_dir: String,
    target_path: String,
    folder_name: String,
) -> Result<String, String> {
    let full_path = PathBuf::from(&docs_dir).join(&target_path).join(&folder_name);
    
    fs::create_dir_all(&full_path)
        .map_err(|e| format!("Failed to create folder: {}", e))?;
    
    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn rename_note(
    docs_dir: String,
    source_path: String,
    new_name: String,
) -> Result<(), String> {
    let source = PathBuf::from(&docs_dir).join(&source_path);
    let target = source.parent()
        .ok_or("Invalid source path")?
        .join(&new_name);
    
    fs::rename(&source, &target)
        .map_err(|e| format!("Failed to rename: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn delete_note(docs_dir: String, note_path: String) -> Result<(), String> {
    let full_path = PathBuf::from(&docs_dir).join(&note_path);
    
    if full_path.is_dir() {
        fs::remove_dir_all(&full_path)
            .map_err(|e| format!("Failed to delete folder: {}", e))?;
    } else {
        fs::remove_file(&full_path)
            .map_err(|e| format!("Failed to delete file: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
async fn read_json_file(file_path: String) -> Result<serde_json::Value, String> {
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON: {}", e))
}

#[tauri::command]
async fn write_json_file(file_path: String, data: serde_json::Value) -> Result<(), String> {
    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize JSON: {}", e))?;
    
    // Atomic write
    let temp_path = format!("{}.tmp", file_path);
    fs::write(&temp_path, content)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    fs::rename(&temp_path, &file_path)
        .map_err(|e| format!("Failed to rename file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn open_external(_path: String) -> Result<(), String> {
    // Use Tauri's shell plugin to open files/folders
    Err("Use Tauri shell plugin directly from frontend".to_string())
}

#[tauri::command]
async fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            data_dir: Mutex::new(None),
            _todos_dir: Mutex::new(None),
            _docs_dir: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_meta_data_path,
            set_meta_data_path,
            pick_folder,
            read_notes,
            read_file_content,
            write_file_content,
            create_note,
            create_folder,
            rename_note,
            delete_note,
            read_json_file,
            write_json_file,
            open_external,
            get_app_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
