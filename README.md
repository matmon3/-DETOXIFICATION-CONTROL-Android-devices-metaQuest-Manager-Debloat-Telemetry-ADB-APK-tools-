# DETOXIFICATION CONTROL — Meta Quest / Android Control Center

Central de controle profissional para dispositivos Android e Meta Quest (2, 3, 3S, Pro),
executada via ADB. Uma ferramenta de diagnóstico/controle estilo SideQuest + Android
Studio Device Manager, com identidade visual cyberpunk/terminal (Serial Experiments Lain).

**Fase atual: 9** — todas as fases implementadas (RPM/AppImage disponíveis).

## Status das Fases

### Fase 1 — infraestrutura e dispositivos

- [x] Arquitetura modular (backend Rust / frontend React)
- [x] Motor ADB seguro (process spawning estruturado, sem `sh -c`)
- [x] Detecção automática de dispositivos (USB + Wi-Fi + Fastboot) em tempo real
- [x] Informações completas do dispositivo (getprop, bateria, storage, RAM, tela, IP, root, devmode)
- [x] Detecção automática de headsets Meta Quest (2/3/3S/Pro)
- [x] Terminal ADB integrado com histórico, serial injetado e comandos rápidos
- [x] UI cyberpunk (preto/roxo, mono, angular) com sidebar, dashboard e statusbar
- [x] Testes unitários do parser de dispositivos e do terminal

### Fase 2 — APK / package manager + file manager

- [x] Listagem de pacotes com detalhes (versão, SDK, tamanho, sistema/usuário, desabilitado)
- [x] Filtros (system / user / disabled / enabled / quest / large) e busca
- [x] Ações por app: launch, force stop, clear data, clear cache, disable, enable,
      uninstall (com confirmação), export APK, abrir configurações
- [x] Instalação de APK(s) com seletor de arquivos, drag-and-drop, progresso e cancelamento
- [x] APK Analyzer (manifest, permissões, componentes, ABIs, assinatura) antes de instalar
- [x] Tela de detalhes do pacote (UID, SDK, paths, permissões, componentes)
- [x] Desinstalação em lote com seleção múltipla
- [x] File manager: navegação, breadcrumbs, atalhos (sdcard, Download, DCIM, …)
- [x] Upload/download com diálogos nativos, progresso em tempo real e cancelamento
- [x] Criar pasta, criar arquivo, renomear, copiar, excluir (com confirmação)
- [x] Drag-and-drop de arquivos do PC para o dispositivo
- [x] Plugin Tauri de diálogos nativos (`tauri-plugin-dialog`)
- [x] Testes unitários do parser de `ls`, normalização de paths e parser de `dumpsys`

### Fase 3 — screenshot / screen record / logcat / performance

- [x] Screenshot com seletor de pasta e pré-visualização local
- [x] Screen record (tamanho/bitrate/fps/time-limit) com gravação, stop e pull
- [x] Logcat streaming em tempo real, filtros, clear, snapshot e export para arquivo
- [x] Performance: CPU, top processos, memória, bateria, storage e uptime
- [x] Eventos Tauri dedicados (`logcat:line`, `record:stopped`) e hooks React

### Fase 4 — ADB Wi-Fi / multi-device / backup

- [x] Conexão `adb connect` com IP+porta, detecção automática do IP do dispositivo
- [x] `adb disconnect` (individual ou todos) e pareamento Android 11+ (`adb pair`)
- [x] `adb tcpip` para habilitar ADB por rede no device USB
- [x] Seletor global de dispositivo ativo (TitleBar) + contexto React compartilhado
- [x] Views sincronizadas com o device ativo (apps, files, terminal, tools, quest)
- [x] Backup de apps selecionados (APK + dados via run-as/root) com manifest.json
- [x] Listagem de arquivos de backup e restauração no device

### Fase 5 — Quest tools + fastboot

- [x] Status do headset (bateria, temperatura, VR shell, power save)
- [x] Toggles de plataforma: FPS counter, Phone SDK, Slow SDK, Guardian
- [x] Reiniciar VR shell, abrir Quest Store
- [x] Boot modes: reboot (system/bootloader/recovery/fastboot)
- [x] Fastboot: lista de devices e reboot seguro (system/bootloader)

### Fase 6 — empacotamento, docs, testes

- [x] Script `scripts/build-release.sh` (RPM padrão, AppImage/deb opcionais)
- [x] `tauri.conf.json` com targets appimage/rpm/deb
- [x] Docs atualizados (ARCHITECTURE, INSTALL, DEVELOPMENT)
- [x] Testes unitários do backend (parsers, wifi, backup, quest)

### Fase 7 — DETOXIFICATION CONTROL (rebranding + módulos avançados)

- [x] Rebranding completo: produto DETOXIFICATION CONTROL, identidade `dev.detoxification.control`
- [x] Sistema de temas: 7 presets (VOID, NEON PURPLE, CYBER BLUE, LAIN, MATRIX,
      NIGHT CITY, TERMINAL), persistência, export/import, Theme Editor visual,
      reduce motion
- [x] ADB Toolkit: device info, reboot modes, screenshot, apps (info/launch/stop/
      clear/disable/enable/uninstall/extract), files (push/pull/delete/rename/mkdir)
- [x] Quest Optimizer: detecção de modelo/OS, telemetria (scan + toggle + proteção
      de críticos), processos classificados, performance tweaks reversíveis
- [x] Quest Debloat: análise por categoria/risco, batch seguro, proteção de
      componentes críticos, detalhes do pacote
- [x] Screen Tools: volume (media/ring/alarm), brilho, snapshot da tela e input
      remoto (tap/swipe/key/text)
- [x] Command Library: comandos ADB salvos (CRUD, favoritos, executar, export/import)
- [x] Activity Log: registro de tudo (evento `log:entry`), filtros, export, clear
- [x] Sidebar redimensionável + densidade/tipografia/cores configuráveis
- [x] Config unificada em `~/.config/detoxification-control/`
- [x] `cargo check` sem warnings, 32 testes passando, `tsc` + `vite build` limpos

### Fase 8 — Quest Performance (estilo OcularMigraine)

- [x] Nível de CPU (0-5) estático ou dinâmico (`debug.oculus.cpuLevel`)
- [x] Nível de GPU (0-5) estático ou dinâmico (`debug.oculus.gpuLevel`)
- [x] FFR fixo (0-4) estático ou dinâmico (`debug.oculus.foveation.level`/`.dynamic`)
- [x] Resolução do eye buffer (`debug.oculus.textureWidth`/`textureHeight`) com
      slider, presets vs. painel nativo e reset
- [x] Reset total (volta todos os overrides ao padrão)
- [x] View Quest Performance + atalho na sidebar/dashboard, log no Activity Log
- [x] 36 testes passando, `cargo check`/`tsc`/`vite build` limpos

### Fase 9 — i18n (multilíngue) + precisão da telemetria

- [x] Base de strings preparada em `frontend/src/i18n/dicts.ts` (en/pt-BR/es),
      deduplicada e com todos os gaps do es corrigidos
- [x] Hook/provider `useI18n` com persistência em localStorage
      `detoxification.lang` e interpolação de params (`{n}`, `{name}`, …)
- [x] Todas as views/components migrados de strings hardcoded para `t()`
- [x] Seletor de idioma em Settings (LANGUAGE / UI)
- [x] Telemetria do Optimizer precisa e conservadora: lista curada de componentes
      conhecidos (Meta/Oculus/Facebook) + match por palavra-chave restrito a
      fornecedores de coleta, eliminando falsos positivos de "crash"/"logging"/
      "feedback" no nome
- [x] `cargo check` limpo, 39 testes passando, `tsc` + `vite build` limpos

## Executar (desenvolvimento)

```bash
./scripts/dev.sh
```

Pré-requisitos: Node ≥ 18, Rust (rustup), e os pacotes de desenvolvimento (ver `INSTALL.md`).

## Build de release (RPM / AppImage / deb)

```bash
./scripts/build-release.sh            # RPM
./scripts/build-release.sh appimage   # AppImage
./scripts/build-release.sh deb        # DEB
./scripts/build-release.sh rpm appimage deb
```

Artefatos em `dist/`.

## Documentação

- `docs/ARCHITECTURE.md` — design do backend
- `docs/INSTALL.md` — instalação no Fedora
- `docs/DEVELOPMENT.md` — como desenvolver e testar
- `docs/TROUBLESHOOTING.md` — problemas comuns
- `docs/SECURITY.md` — princípios de segurança

## Identidade

```
DETOXIFICATION CONTROL
META QUEST / ANDROID CONTROL CENTER
DEVICE CONTROL INTERFACE
```

Estética: preto quase absoluto `#050509`, roxo neon `#8B5CF6`, azul elétrico e magenta,
mono (JetBrains Mono), bordas 1px, cantos de 2px, scanlines, glitch, glow neon,
terminais e indicadores LED. Sem gradientes exagerados, sem cards arredondados,
sem aparência SaaS.
