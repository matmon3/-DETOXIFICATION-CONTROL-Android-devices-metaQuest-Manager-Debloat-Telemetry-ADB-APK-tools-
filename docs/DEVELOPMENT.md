# Desenvolvimento — DETOXIFICATION CONTROL

## Stack

- Backend: Rust (Tauri v2, tauri-plugin-opener, tauri-plugin-dialog, serde, shlex)
- Frontend: React 18, TypeScript, Vite, lucide-react, JetBrains Mono (fontsource)
- Testes: `cargo test` (backend), `tsc --noEmit` + vite build (frontend)

## Comandos

```bash
# dev (vite + tauri debug)
./scripts/dev.sh

# testes do backend
cd src-tauri && cargo test

# typecheck + build do frontend
cd frontend && npm run build

# typecheck apenas
cd frontend && npx tsc --noEmit

# build de release (RPM/AppImage/deb → dist/)
./scripts/build-release.sh
./scripts/build-release.sh appimage deb
```

## Estrutura de diretórios

```
backend (Rust) → src-tauri/src/
  commands/    IPC handlers (thin)
  modules/
    adb/       executor + resolver (list/parsers) + wifi (connect/pair)
    devices/   manager (watcher) + info (coleta)
    terminal/  shlex + execução
    packages/  Fase 2
    filesystem/ Fase 2
    screen/    screenshot + screen record (Fase 3)
    logcat/    streaming (Fase 3)
    performance/ snapshot (Fase 3)
    backup/    backup/restauração (Fase 4)
    quest/     Quest tools + boot/fastboot (Fase 5)
    themes.rs  temas (presets + persistência) (Fase 7)
    commandlib.rs  biblioteca de comandos ADB (Fase 7)
    activitylog.rs  histórico de operações (Fase 7)
    optimizer.rs  telemetria/processos/tweaks (Fase 7)
    debloat.rs  análise de pacotes/risco (Fase 7)
    screentools.rs  volume/brilho/preview/input (Fase 7)
    questperf.rs  CPU/GPU/FFR/resolução do eye buffer (Fase 8)
  config.rs    settings.json (~/.config/detoxification-control)
  error.rs     AppError amigável

frontend (React) → frontend/src/
  api/         bridge.ts (invoke) + types.ts
  hooks/       useDevices, useTransfers, useActiveDevice/useActiveSerial, useTheme
  components/  TitleBar, Sidebar, StatusBar, Indicator, DeviceTable, ConfirmDialog
  views/       Dashboard, Devices, DeviceDetail, Terminal, Apps, Files,
               Screenshot, Record, Logcat, Performance, Network, Backups,
                Quest, Fastboot, Settings, AdbToolkit, QuestOptimizer,
                QuestDebloat, ScreenTools, CommandLibrary, ActivityLog, ThemeEditor,
                Perf (Quest Performance)
  appLog.ts    log de operações em memória
```

## Convenções

- Nunca chame `adb` por `sh -c`. Use `Command::new` + `args`.
- Nunca exponha lógica ADB no frontend.
- Novo comando: implementar em `modules/<dominio>` + registrar em
  `commands/<dominio>.rs` + registrar no `generate_handler!` (lib.rs) +
  declarar no `bridge.ts` + tipo em `types.ts`.
- Novos eventos do watcher: emitir em `manager.rs`, escutar em `useDevices`.
- Todo comando ADB que possa demorar deve ser `async` + `spawn_blocking`
  (clonando o `Arc<DeviceManager>` antes de mover para o closure).

## Testes

Os testes de parser (`resolver.rs`, `terminal/mod.rs`) rodam sem dispositivo.
Para testar fluxos reais, conecte um dispositivo com USB debugging habilitado.

## Fases

1. ✅ arquitetura/UI/detecção/info/terminal
2. ✅ APK + package manager + file manager
3. ✅ screenshot/record/logcat/performance
4. ✅ backup/Wi-Fi/multi-device
5. ✅ Quest tools/fastboot
6. ✅ empacotamento (RPM/AppImage/deb) + docs + testes
7. ✅ rebranding DETOXIFICATION CONTROL + temas/commandlib/activitylog/optimizer/debloat/screentools + views + testes
8. ✅ Quest Performance (CPU/GPU/FFR/resolução estilo OcularMigraine) + PerfView

## Estado atual

- Backend: `cargo check` sem warnings, 36 testes passando (1 ignorado).
- Frontend: `tsc --noEmit` limpo + `vite build` ok.
- Pacotes gerados em `dist/`: `detoxification-control-*.rpm`, `detoxification-control_*_amd64.AppImage` e `*.deb`.
- Config persistida em `~/.config/detoxification-control/` (theme.json, commands.json,
  activity.json, settings.json). Resolução do adb: settings.json >
  env `DETOXIFICATION CONTROL_ADB` (fallback `AQM_ADB`) > PATH.
