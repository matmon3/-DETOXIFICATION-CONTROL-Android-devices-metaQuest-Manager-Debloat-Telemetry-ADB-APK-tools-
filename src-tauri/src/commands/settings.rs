use crate::config;
use crate::error::AppError;

#[tauri::command]
pub fn get_settings() -> Result<config::Settings, AppError> {
    Ok(config::load())
}

#[tauri::command]
pub fn update_settings(settings: config::Settings) -> Result<(), AppError> {
    config::save(&settings).map_err(AppError::new)
}
