//! Registro central de dispositivos com monitoramento em tempo real.
//!
//! Um thread de watcher consulta `adb devices -l` periodicamente e emite
//! eventos para o frontend quando a lista muda.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;
use crate::modules::adb::resolver::{list_devices, Device};
use crate::modules::devices::info::{self, DeviceInfo};
use crate::modules::transfer::TransferRegistry;

#[derive(Clone)]
pub struct DeviceManager {
    pub adb: AdbRunner,
    devices: Arc<Mutex<HashMap<String, Device>>>,
    info_cache: Arc<Mutex<HashMap<String, DeviceInfo>>>,
    running: Arc<AtomicBool>,
    transfers: Arc<TransferRegistry>,
}

impl DeviceManager {
    pub fn new(adb: AdbRunner) -> Self {
        Self {
            adb,
            devices: Arc::new(Mutex::new(HashMap::new())),
            info_cache: Arc::new(Mutex::new(HashMap::new())),
            running: Arc::new(AtomicBool::new(true)),
            transfers: Arc::new(TransferRegistry::new()),
        }
    }

    pub fn adb_runner(&self) -> &AdbRunner {
        &self.adb
    }

    /// Lista atual (cached) de dispositivos.
    pub fn current_devices(&self) -> Vec<Device> {
        let guard = self.devices.lock().unwrap();
        let mut v: Vec<Device> = guard.values().cloned().collect();
        v.sort_by(|a, b| a.serial.cmp(&b.serial));
        v
    }

    pub fn cached_info(&self, serial: &str) -> Option<DeviceInfo> {
        self.info_cache.lock().unwrap().get(serial).cloned()
    }

    /// Acesso ao registro de transferências ativas (instalação/push/pull).
    pub fn transfers(&self) -> &TransferRegistry {
        &self.transfers
    }

    /// Arc do registro de transferências (para mover para threads).
    pub fn transfers_arc(&self) -> Arc<TransferRegistry> {
        self.transfers.clone()
    }

    pub fn refresh_info(&self, serial: &str) -> Result<DeviceInfo, AppError> {
        let info = info::collect(&self.adb, serial);
        self.info_cache
            .lock()
            .unwrap()
            .insert(serial.to_string(), info.clone());
        Ok(info)
    }

    /// Inicia o watcher que monitora a lista de dispositivos.
    pub fn start_watcher(&self, app: AppHandle) {
        let devices = self.devices.clone();
        let running = self.running.clone();
        let adb = self.adb.clone();

        std::thread::spawn(move || {
            let mut last: HashMap<String, Device> = HashMap::new();
            let poll = Duration::from_millis(1000);
            loop {
                if !running.load(Ordering::Relaxed) {
                    break;
                }
                let found = list_devices(&adb);
                let mut current: HashMap<String, Device> = HashMap::new();
                for d in found {
                    current.insert(d.serial.clone(), d.clone());
                }

                // Delta de entrada
                for (serial, dev) in current.iter() {
                    if !last.contains_key(serial) {
                        let _ = app.emit("device:connected", dev);
                    }
                }
                // Delta de saída
                for serial in last.keys() {
                    if !current.contains_key(serial) {
                        let _ = app.emit("device:disconnected", serial);
                    }
                }

                // Atualização da lista completa
                let mut sorted: Vec<Device> = current.values().cloned().collect();
                sorted.sort_by(|a, b| a.serial.cmp(&b.serial));
                let _ = app.emit("devices:updated", &sorted);

                *devices.lock().unwrap() = current.clone();
                last = current;
                std::thread::sleep(poll);
            }
        });
    }
}
