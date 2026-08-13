//! Fase 2: gerenciador de arquivos do dispositivo.
//!
//! Navegação via `ls -lan`, operações (criar/renomear/excluir) e
//! upload/download com progresso e cancelamento.

pub mod list;
pub mod ops;
pub mod transfer;

use serde::Serialize;

/// Entrada de um diretório remoto.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub perms: String,
    pub uid: u64,
    pub gid: u64,
    pub mtime: String,
    pub parent: String,
}

impl FsEntry {
    /// Tamanho exibível ("4.0 KB") — dirs mostram o tamanho do inode.
    pub fn size_human(&self) -> String {
        crate::modules::util::human_size(self.size)
    }
}
