//! Listagem de diretórios remotos via `ls -lan` (toybox).

use crate::error::AppError;
use crate::modules::adb::executor::AdbRunner;
use crate::modules::filesystem::FsEntry;
use crate::modules::util::shell_quote;

/// Lista um diretório do dispositivo. `path` é o caminho absoluto remoto.
pub fn list_dir(runner: &AdbRunner, serial: &str, path: &str) -> Result<Vec<FsEntry>, AppError> {
    if path.is_empty() {
        return Err(AppError::new("Path is empty."));
    }
    let clean = normalize_path(path);
    let cmd = format!("ls -lan {}", shell_quote(&clean));
    let out = runner.run_serial(serial, &["shell", &cmd])?;
    if out.exit_code != Some(0) {
        return Err(AppError::with_detail(
            format!("Cannot list directory: {clean}"),
            out.stderr,
        ));
    }
    Ok(parse_ls(&out.stdout, &clean))
}

/// Caminho normalizado (sem `..`/`.` redundantes) para exibição e navegação.
pub fn normalize_path(path: &str) -> String {
    if path.is_empty() {
        return "/".to_string();
    }
    let is_root = path.starts_with('/');
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            p => parts.push(p),
        }
    }
    let joined = parts.join("/");
    if is_root || path.starts_with("//") {
        format!("/{joined}")
    } else {
        joined
    }
}

/// Joina um nome de arquivo a um diretório.
pub fn join_path(dir: &str, name: &str) -> String {
    if dir == "/" {
        format!("/{name}")
    } else {
        format!("{}/{}", dir.trim_end_matches('/'), name)
    }
}

fn parse_ls(output: &str, base: &str) -> Vec<FsEntry> {
    let mut entries = Vec::new();
    for line in output.lines() {
        let line = line.trim_end();
        if line.is_empty() || line == "total 0" || line.starts_with("total ") {
            continue;
        }
        let Some(entry) = parse_line(line, base) else { continue };
        entries.push(entry);
    }
    // Diretórios primeiro, depois nome.
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    entries
}

fn parse_line(line: &str, base: &str) -> Option<FsEntry> {
    let tokens: Vec<&str> = line.split_whitespace().collect();
    if tokens.len() < 7 {
        return None;
    }
    let mode = tokens[0];
    if mode.len() != 10 || !mode.starts_with(['d', '-', 'l', 'b', 'c', 's', 'p']) {
        return None;
    }
    let uid = tokens[2].parse::<u64>().ok()?;
    let gid = tokens[3].parse::<u64>().ok()?;
    let size = tokens[4].parse::<u64>().ok()?;

    // Data: tokens[5] tokens[6] (ex.: "2026-08-11 18:20").
    let mtime = format!("{} {}", tokens[5], tokens[6]);

    // Nome: tudo depois da data (pode conter espaços).
    let name = tokens[7..].join(" ");
    if name.is_empty() || name == "." || name == ".." {
        return None;
    }
    let is_dir = mode.starts_with('d');
    let is_symlink = mode.starts_with('l');
    let name_display = name.split(" -> ").next().unwrap_or(&name).to_string();
    let path = join_path(base, &name_display);

    Some(FsEntry {
        name: name_display,
        path,
        is_dir,
        is_symlink,
        size,
        perms: mode.to_string(),
        uid,
        gid,
        mtime,
        parent: base.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_toybox_lines() {
        let out = "total 8\n\
-rwxrwx--- 1 10120 1023 846432 2026-08-11 18:20 (7) Pinterest\n\
drwxr-xr-x  29 0 0 4096 2008-12-31 22:00 acct\n\
lrw-r--r--   1 0 0 11 2008-12-31 22:00 bin -> /system/bin\n";
        let entries = parse_ls(out, "/");
        assert_eq!(entries.len(), 3);
        let pinterest = entries.iter().find(|e| e.name == "(7) Pinterest").unwrap();
        assert!(!pinterest.is_dir);
        assert_eq!(pinterest.size, 846432);
        assert_eq!(pinterest.path, "/(7) Pinterest");
        let acct = entries.iter().find(|e| e.name == "acct").unwrap();
        assert!(acct.is_dir);
        let bin = entries.iter().find(|e| e.name == "bin").unwrap();
        assert!(bin.is_symlink);
    }

    #[test]
    fn normalizes() {
        assert_eq!(normalize_path("//sdcard//DCIM/./x"), "/sdcard/DCIM/x");
        assert_eq!(normalize_path("/a/b/../c"), "/a/c");
        assert_eq!(normalize_path("/"), "/");
        assert_eq!(join_path("/", "x"), "/x");
        assert_eq!(join_path("/sdcard", "x"), "/sdcard/x");
    }
}
