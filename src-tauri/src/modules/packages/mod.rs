//! Fase 2: gerenciador de pacotes / APK.
//!
//! Listagem com detalhes (`dumpsys package`), instalação com progresso e
//! cancelamento, ações (launch/stop/clear/disable/enable/uninstall/export),
//! permissões e analyzer de APK local.

pub mod actions;
pub mod analyzer;
pub mod axml;
pub mod detail;
pub mod install;
pub mod list;

use serde::Serialize;

/// Informação resumida de um pacote instalado (lista).
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub package: String,
    pub version_name: String,
    pub version_code: Option<i64>,
    pub install_date: Option<String>,
    pub update_date: Option<String>,
    /// Tamanho em bytes (soma dos APKs em /data/app).
    pub size_bytes: u64,
    pub is_system: bool,
    pub disabled: bool,
    pub code_path: String,
    pub min_sdk: Option<i64>,
    pub target_sdk: Option<i64>,
}

/// Estado de uma permissão.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PermissionState {
    pub name: String,
    pub granted: bool,
    pub flags: String,
}

/// Detalhes completos de um pacote (tela de detalhes).
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PackageDetail {
    pub package: String,
    pub uid: Option<i64>,
    pub version_name: String,
    pub version_code: Option<i64>,
    pub min_sdk: Option<i64>,
    pub target_sdk: Option<i64>,
    pub first_install_time: Option<String>,
    pub last_update_time: Option<String>,
    pub code_path: String,
    pub data_dir: String,
    pub native_library_dir: String,
    pub primary_cpu_abi: String,
    pub is_system: bool,
    pub disabled: bool,
    pub permissions: Vec<PermissionState>,
    pub activities: Vec<String>,
    pub services: Vec<String>,
    pub receivers: Vec<String>,
    pub providers: Vec<String>,
}
