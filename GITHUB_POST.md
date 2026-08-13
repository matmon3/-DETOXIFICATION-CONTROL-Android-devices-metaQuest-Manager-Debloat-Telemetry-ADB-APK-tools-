# DETOXIFICATION CONTROL 🚀

## Seu painel de controle definitivo para Meta Quest e Android via ADB

---

### ✨ O que este app faz:

🔌 **Conexão ADB em Tempo Real**
- Detecta dispositivos Android + Quest via ADB
- Conectar/Desconectar via TCP/IP
- Emparelhamento e modo tcpip

📱 **Gerenciador de APKs Completo**
- Instalação de APKs com barra de progresso
- Analisador de packages com detalhes
- Gerenciador de arquivos (upload/download/drag-drop)

🛡️ **Otimizador e Debloat**
- Detecção de telemetria (Quest + Google + OEM)
- Remoção de apps de sistema com proteção de críticos
- Otimizações reversíveis (toggles: FPS Counter, Phone SDK, Slow SDK, Guardian)

🖥️ **Ferramentas de Tela**
- Screencap + Pull + Preview
- Screen Record (token/stop/pull)
- Logcat streaming (eventos em tempo real)
- Performance monitor (top, meminfo, battery, df, uptime)
- Volume e brilho do HMD

🔄 **Backup & Restore**
- Backup completo (manifest.json + apks/ + data/)
- Restauração seletiva
- Múltiplos dispositivos

🎨 **Themes & UI**
- 7 presets de tema (persistência em config)
- Tema cyberpunk com scanlines/glitch/glow/neon
- Sidebar resizable (largura persistente)
- Tema reduzidoMotion via localStorage

📊 **Gerenciamento Multi-device**
- Context ActiveDeviceProvider
- Seletor no TitleBar
- Hook useActiveSerial sincroniza views

🛠️ **Commands & Library**
- Biblioteca de commands salvos em JSON
- Execução via shlex
- Log de atividade (ring buffer 500 eventos)

🌐 **Wi-Fi ADB**
- Conectar/Desconectar/Pair/Tcpip
- Módulos completos de Wi-Fi

---

### 🖥️ Platforms Suportados

| Platform | Build |
|----------|-------|
| 🐧 Linux | AppImage + RPM + DEB |
| 🪟 Windows | .exe installer + .msi |
| 🍎 macOS | (build na plataforma) |

---

### 🎯 Tecnologia

- **Rust + Tauri v2** - Performance nativa, baixo consumo de memória
- **React + Vite** - Interface rápida e responsiva
- **ADB via process spawn estruturado** - Seguro e confiável
- **Dark mono theme** - Foco em desenvolvitor/usuario experience

---

### 📦 Como testar

```bash
# Development
./scripts/dev.sh

# Build release
./scripts/build-release.sh [rpm|appimage|deb]
```

---

### 🐙 Disponível no GitHub

🌟 **Star** o repositório e acompanhe as releases!

Tags: `v0.1.0` → gera automaticamente `.exe` (Windows), `AppImage`, `RPM`, `DEB`

---

### 💜💚 Feito com ❤️ para a comunidade Meta Quest & Android

<p align="center">
  <img src="https://github.com/user-attachments/26742d63-13aa-4429-becc-a4ae3f0b3737.png" alt="Detoxification Control Icon" width="128">
</p>

---

**📍 Mais info:** Confira o README.md e os workflows em `.github/workflows/release.yml`

#DetoxificationControl #Tauri #Rust #ADB #MetaQuest #Android #OpenSource #GitHub #DevTools