//! Tipos e eventos compartilhados de operações de transferência
//! (instalação de APK, upload/download de arquivos).
//!
//! Fluxo:
//! 1. `start_*` retorna um `token`.
//! 2. A operação roda em thread com cancelamento cooperativo.
//! 3. Progresso chega via eventos `transfer:progress` / `transfer:done`.

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgress {
    pub token: String,
    pub pct: Option<u8>,
    pub line: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TransferDone {
    pub token: String,
    pub ok: bool,
    pub message: String,
    pub detail: Option<String>,
}

/// Registro de tokens de transferência ativa (cancelamento cooperativo).
#[derive(Default)]
pub struct TransferRegistry {
    tokens: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl TransferRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Cria um token único com flag de cancelamento em `false`.
    pub fn create(&self) -> (String, Arc<AtomicBool>) {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.subsec_nanos())
            .unwrap_or(0);
        let token = format!("tr-{}-{nanos}", std::process::id());
        let flag = Arc::new(AtomicBool::new(false));
        self.tokens.lock().unwrap().insert(token.clone(), flag.clone());
        (token, flag)
    }

    /// Marca o token como cancelado (o processo é morto em breve).
    pub fn cancel(&self, token: &str) -> bool {
        let map = self.tokens.lock().unwrap();
        match map.get(token) {
            Some(flag) => {
                flag.store(true, std::sync::atomic::Ordering::Relaxed);
                true
            }
            None => false,
        }
    }

    /// Remove o token do registro (no fim da operação).
    pub fn finish(&self, token: &str) {
        self.tokens.lock().unwrap().remove(token);
    }
}
