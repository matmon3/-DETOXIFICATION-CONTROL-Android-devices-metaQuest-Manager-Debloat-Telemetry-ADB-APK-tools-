//! Analyzer de APK local: extrai manifest (AXML), permissões, componentes,
//! ABIs e assinatura sem instalar o app no dispositivo.

use std::collections::BTreeSet;
use std::io::Read;
use std::path::Path;

use serde::Serialize;

use crate::error::AppError;
use crate::modules::packages::axml::{self, attr_from_element, component_names, find_elements};

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ApkInfo {
    pub file_name: String,
    pub file_size: u64,
    pub package: String,
    pub version_name: String,
    pub version_code: Option<i64>,
    pub min_sdk: Option<i64>,
    pub target_sdk: Option<i64>,
    pub permissions: Vec<String>,
    pub features: Vec<String>,
    pub activities: Vec<String>,
    pub services: Vec<String>,
    pub receivers: Vec<String>,
    pub providers: Vec<String>,
    pub abis: Vec<String>,
    pub signature: String,
}

/// Analisa um APK (ou AAB) do disco local.
pub fn analyze_apk(path: &str) -> Result<ApkInfo, AppError> {
    let path_p = Path::new(path);
    if !path_p.exists() {
        return Err(AppError::new(format!("APK not found: {path}")));
    }
    let file_size = std::fs::metadata(path_p)
        .map(|m| m.len())
        .unwrap_or(0);

    let file = std::fs::File::open(path_p).map_err(|e| {
        AppError::with_detail(format!("Failed to open APK: {path}"), e.to_string())
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| {
        AppError::with_detail(format!("Not a valid APK zip: {path}"), e.to_string())
    })?;

    // 1) AndroidManifest.xml
    let manifest_bytes = {
        let mut entry = archive.by_name("AndroidManifest.xml").map_err(|e| {
            AppError::with_detail("APK has no AndroidManifest.xml", e.to_string())
        })?;
        let mut buf = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut buf).map_err(|e| {
            AppError::with_detail("Failed to read AndroidManifest.xml", e.to_string())
        })?;
        buf
    };
    let xml = axml::to_xml(&manifest_bytes)
        .map_err(|e| AppError::new(format!("Failed to parse binary manifest: {e}")))?;

    // 2) Dados do manifest
    let package = axml::extract_attr(&xml, "package").unwrap_or_default();
    let version_name = axml::extract_attr(&xml, "android:versionName").unwrap_or_default();
    let version_code = axml::extract_attr(&xml, "android:versionCode")
        .and_then(|v| v.parse::<i64>().ok());

    let mut min_sdk = None;
    let mut target_sdk = None;
    for el in find_elements(&xml, "uses-sdk") {
        if min_sdk.is_none() {
            min_sdk = attr_from_element(&el, "android:minSdkVersion")
                .and_then(|v| v.parse::<i64>().ok());
        }
        if target_sdk.is_none() {
            target_sdk = attr_from_element(&el, "android:targetSdkVersion")
                .and_then(|v| v.parse::<i64>().ok());
        }
    }

    // 3) Permissões e features declaradas
    let permissions = find_elements(&xml, "uses-permission")
        .iter()
        .filter_map(|el| attr_from_element(el, "android:name"))
        .collect::<Vec<_>>();
    let mut features = Vec::new();
    for el in find_elements(&xml, "uses-feature") {
        if let Some(name) = attr_from_element(&el, "android:name") {
            features.push(name);
        } else if let Some(gl) = attr_from_element(&el, "android:glEsVersion") {
            features.push(format!("OpenGL ES {gl}"));
        }
    }

    // 4) Componentes
    let activities = component_names(&xml, "activity");
    let services = component_names(&xml, "service");
    let receivers = component_names(&xml, "receiver");
    let providers = component_names(&xml, "provider");

    // 5) ABIs nativas
    let mut abis = BTreeSet::new();
    for name in archive.file_names() {
        if let Some(rest) = name.strip_prefix("lib/") {
            if let Some(dir) = rest.split('/').next() {
                if !dir.is_empty() && dir != "index" {
                    abis.insert(dir.to_string());
                }
            }
        }
    }

    // 6) Assinatura (v1 = META-INF/*.RSA). Certificado via openssl (opcional).
    let mut signer_name = String::from("unsigned");
    let mut cert_file: Option<String> = None;
    for name in archive.file_names() {
        if name.starts_with("META-INF/")
            && name.ends_with(".RSA")
            || name.ends_with(".DSA")
            || name.ends_with(".EC")
        {
            cert_file = Some(name.to_string());
            break;
        }
    }
    if let Some(cert) = cert_file {
        if let Ok(entry) = archive.by_name(&cert) {
            signer_name = signer_from_cert(entry, &cert);
        }
    }

    let file_name = path_p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());

    Ok(ApkInfo {
        file_name,
        file_size,
        package,
        version_name,
        version_code,
        min_sdk,
        target_sdk,
        permissions,
        features,
        activities,
        services,
        receivers,
        providers,
        abis: abis.into_iter().collect(),
        signature: signer_name,
    })
}

fn signer_from_cert(
    entry: zip::read::ZipFile<'_>,
    name: &str,
) -> String {
    let mut data = Vec::new();
    let mut entry = entry;
    if entry.read_to_end(&mut data).is_err() || data.is_empty() {
        return format!("RSA certificate ({name})");
    }

    // openssl
    let tmp = std::env::temp_dir().join(format!("aqm-cert-{}.der", std::process::id()));
    if std::fs::write(&tmp, &data).is_err() {
        return format!("RSA certificate ({name})");
    }
    let out = std::process::Command::new("openssl")
        .args(["pkcs7", "-inform", "DER", "-print_certs"])
        .arg(&tmp)
        .output();
    let _ = std::fs::remove_file(&tmp);
    match out {
        Ok(o) if o.status.success() => {
            let text = String::from_utf8_lossy(&o.stdout);
            for line in text.lines() {
                if line.to_ascii_lowercase().starts_with("subject=") {
                    let subj = line["subject=".len()..].trim().to_string();
                    if !subj.is_empty() {
                        return subj;
                    }
                }
            }
            "signature present (unknown cert)".into()
        }
        _ => format!("RSA certificate ({name})"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "requer APK real em AQM_TEST_APK"]
    fn analyze_real_apk() {
        let path = std::env::var("AQM_TEST_APK").expect("set AQM_TEST_APK");
        if let Ok(out) = std::process::Command::new("unzip")
            .args(["-p", &path, "AndroidManifest.xml"])
            .output()
        {
            println!("POOL: {}", crate::modules::packages::axml::debug_pool_info(&out.stdout));
            if let Ok(xml) = crate::modules::packages::axml::to_xml(&out.stdout) {
                std::fs::write("/tmp/opencode/rendered.xml", &xml).ok();
                println!("--- XML HEAD ---\n{}\n--- END ---", &xml[..xml.len().min(3000)]);
            } else {
                println!("xml err");
            }
        }
        let info = analyze_apk(&path).expect("analyze");
        println!("{:#?}", info);
    }
}
