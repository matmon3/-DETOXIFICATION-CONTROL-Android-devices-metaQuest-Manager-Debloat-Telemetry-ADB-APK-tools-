# Arquitetura — DETOXIFICATION CONTROL

## Visão geral

```
┌───────────────────────────────────────────────────────────┐
│ frontend/  React 18 + TypeScript + Vite (Tauri webview)  │
│   views → componentes → api/bridge.ts → @tauri-apps/api  │
└───────────────────────────┬───────────────────────────────┘
                            │ IPC (invoke / eventos)
┌───────────────────────────▼───────────────────────────────┐
│ src-tauri/  Rust                                          │
│   commands/     camada IPC (thin, sem lógica ADB)          │
│   modules/      domínio                                   │
│     adb/          executor (process spawn seguro)          │
│                   resolver (device list, parsers)          │
│     devices/      manager (registro + watcher)             │
│                   info (coleta detalhada)                  │
│     terminal/     parse shlex + execução                   │
│     packages/     list/detail/actions/install/analyzer     │
│     filesystem/   list/ops/transfer                        │
│     transfer.rs   registro de tokens + eventos            │
│     screen.rs     screenshot + screen record               │
│     logcat.rs     streaming de logs                        │
│     performance.rs snapshot de CPU/mem/processos           │
│     adb/wifi.rs   conexão ADB por rede (connect/pair)      │
│     backup.rs     backup/restauração de apps + dados       │
│     quest.rs      ferramentas específicas do Quest         │
│   config.rs      settings.json                            │
│   error.rs       erros amigáveis + detalhe técnico         │
└───────────────────────────┬───────────────────────────────┘
                            │ std::process::Command (args estruturados)
┌───────────────────────────▼───────────────────────────────┐
│ adb / fastboot (binários do sistema ou configurados)      │
└───────────────────────────────────────────────────────────┘
```

## Regras de arquitetura

1. **Nenhuma lógica de ADB em componentes React.** O frontend só conhece comandos
   (`devices_list`, `device_info`, `terminal_execute`, ...) e tipos seriais.
2. **Nenhum shell para invocar adb.** `std::process::Command` com `args: Vec<String>`.
   A linha do terminal é parseada com `shlex` e o serial injetado como argumento
   estruturado `-s <serial>`.
3. **Watcher desacoplado.** Um thread de fundo polia `adb devices -l` a cada 1s e
   emite eventos (`devices:updated`, `device:connected`, `device:disconnected`).
   O frontend se inscreve via `@tauri-apps/api/event`.
4. **Erros amigáveis.** `AppError { message, detail }` — `message` para o usuário,
   `detail` para "View technical details". Dicas de causa comuns (unauthorized,
   offline, sem dispositivos).
5. **Estado centralizado.** `DeviceManager` (Arc) gerido pelo Tauri. Cache de
   informações (`info_cache`) evita re-coleta desnecessária.

## Fluxo de dados

- **Boot:** `setup` → resolve binário adb → `adb start-server` (thread) →
  watcher inicia → eventos alimentam o frontend.
- **Device info:** `device_info(serial)` → coleta via `adb shell` (getprop,
  dumpsys battery, df, meminfo, wm size/density, ip, su, devmode) → cache →
  JSON → DeviceDetailView.
- **Terminal:** `terminal_execute(input, serial)` → shlex → bloqueia `sh`/`bash`/
  `eval` → injeta `-s serial` → `adb <args>` com timeout → stdout/stderr.
- **Packages:** `packages_list(serial)` → `dumpsys package packages` + `pm list -d`
  + `du -sk` (cache 60s) → `AppInfo[]`. Ações via `pm`/`am`/`monkey` com args
  estruturados. Instalação via `adb install(-multiple)` com streaming de stderr
  (percentual) e eventos `transfer:progress` / `transfer:done`.
- **Filesystem:** `fs_list` → `ls -lan` (toybox) parseado → `FsEntry[]`. Ops
  (mkdir/touch/rename/copy/delete) via `adb shell` com `shell_quote` no caminho.
  Upload/download via `adb push/pull` com progresso e cancelamento cooperativo.
- **Transferências:** `transfer.rs` cria token + flag de cancelamento por
  operação; o frontend se inscreve em `transfer:*` via hook `useTransfers`.
- **Screen (Fase 3):** screenshot via `screencap` + pull; screen record via
  `screenrecord` com token de cancelamento e evento `record:stopped`.
- **Logcat (Fase 3):** `adb logcat` em thread, cada linha emitida como
  `logcat:line`; snapshot + export para arquivo.
- **Performance (Fase 3):** snapshot via `top -n 1 -b`, `cat /proc/meminfo`,
  `dumpsys battery`, `df`, `cat /proc/uptime`.
- **Wi-Fi (Fase 4):** `adb connect/disconnect/pair/tcpip` no `adb/wifi.rs`.
  Validação de IP/porta com testes unitários. A view Network mostra devices por
  transporte (usb/wifi) e permite enable de TCP/IP + pareamento Android 11+.
- **Multi-device (Fase 4):** contexto React `ActiveDeviceProvider` com o device
  ativo global; seletor no TitleBar; hook `useActiveSerial` sincroniza as views
  (apps, files, logcat, screenshot, record, performance, backups, quest).
- **Backup (Fase 4):** `backup.rs` grava `manifest.json` + `apks/` + `data/`
  por backup; restaura APKs e dados (run-as para apps debuggable).
- **Quest (Fase 5):** toggles de plataforma (fpsCounter, phoneSdk, slowSdk,
  guardian) via `setprop`/`settings put`, restart do VR shell, boot modes via
  `adb reboot` e `fastboot reboot`.

## Tipos-chave

- `Device { serial, state, transport, model, product, codename, transport_id }`
- `DeviceState`: connected / unauthorized / offline / bootloader / recovery / ...
- `Transport`: usb / wifi / fastboot / unknown
- `DeviceInfo`: identidade, sistema, power, storage, display, link (IP, devmode, root, quest)
- `AppInfo`: pacote, versões, SDK min/target, tamanho, sistema/desabilitado
- `PackageDetail`: UID, paths, permissões (granted/denied), componentes
- `ApkInfo`: analyzer local (package, SDK, ABIs, permissões, assinatura)
- `FsEntry`: nome, path, is_dir, tamanho, perms, mtime, parent
- `TransferProgress` / `TransferDone`: eventos de progresso/fim (install, push, pull)
- `PerfSnapshot`: CPU/processos/memória/bateria/storage/uptime (Fase 3)
- `QuestStatus`: toggles de plataforma + estado do headset (Fase 5)
- `BackupSummary` / `BackupEntry`: metadados de backup (Fase 4)

## Resolução do binário adb

`settings.json` (`~/.config/detoxification-control/settings.json`) → env `DETOXIFICATION CONTROL_ADB` (fallback `AQM_ADB`) → PATH → fallback `adb`.
Mesma lógica para `fastboot`.
