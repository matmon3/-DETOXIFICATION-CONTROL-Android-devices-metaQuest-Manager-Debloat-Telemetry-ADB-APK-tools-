# <p align="middle">👾☣️Detoxification Control🎛️☣️👾

# Desktop application for managing Android and Quest 🥽(quest 2,3/3s...)​ devices via ADB. Centralizes package management, Debloat tools, file operations, telemetry control, ADB terminal, made for the most control and management your device to the person who owns the device should have meaningful control over it., to your device be really yours and not for the parasites. 👨‍💻

## Features

### Device Management

- Real-time device detection via USB, Wi-Fi, and Fastboot (polls `adb devices -l` every second)
- Multi-device support with a global active device selector — all views sync to the selected device
- Full device info collection: model, manufacturer, Android version, SDK, build fingerprint, battery (level, temperature, status), storage, RAM, screen resolution/density, IP, root status, developer mode
- Meta Quest detection and identification (Quest 2, 3, 3S, Pro, headset name, firmware version)

### Terminal for ADB 

- Built-in terminal with command history
- Device serial injection — commands are routed to the selected device automatically
- Host shell commands (`sh`, `bash`, `eval`, `sudo`, `rm`, `dd`) are blocked for safety
- All ADB calls use structured process spawning (`std::process::Command`), never `sh -c`

### Package & APK Management 📥

- Full package listing with version, SDK, install date, size, system/user/disabled status
- Filters: system, user, disabled, enabled, Quest, large
- Actions: launch, force stop, clear data, clear cache, disable, enable, uninstall (with confirmation), export APK, open app settings
- APK installation with file picker, drag-and-drop, progress streaming, and cancellation
- APK Analyzer: extracts manifest details, permissions, components, ABIs, signature before installation
- Package detail view: UID, paths, permissions (granted/denied), activities, services, receivers, providers
- Batch uninstall with multi-select

### File Manager💿

- Remote directory browsing with breadcrumbs and quick-access shortcuts (sdcard, Download, DCIM, etc.)
- Upload and download with native file dialogs, real-time progress, and cancellation
- Create directory, create file, rename, copy, delete (with confirmation)
- Drag-and-drop from host to device


### Performance Monitoring

- CPU load, top processes, memory (total/free/available), battery, storage, and uptime — all from `adb shell`

### Network & Wi-Fi ADB

- `adb connect` / `adb disconnect` with IP and port
- `adb pair` for Android 11+ wireless pairing
- `adb tcpip` to enable Wi-Fi ADB from a USB-connected device
- Automatic device IP detection

### Backup & Restore 💾

- Backup selected apps (APK + data) with `manifest.json` metadata
- Restore APKs and data (via `run-as` for debuggable apps or root)
- List existing backups

### Quest Tools

- Headset status: battery, temperature, VR shell state, power save mode
- Platform toggles: FPS counter, Phone SDK, Slow SDK, Guardian
- Restart VR shell, open Quest Store
- Reboot modes: system, bootloader, recovery, fastboot


### Debloat

- Package analysis by category and risk level (low/medium/high/critical)
- Recommended actions with safety classification
- Critical system components are protected from accidental disable
- Batch toggle with confirmation
- Package detail inspection before changes

### Telemetry Control 📡🪪❌

- Scan for known telemetry components (Meta/Oculus, Google, OEM vendors)
- Per-component enable/disable with source classification (QUEST/GOOGLE/OEM/GENERIC)
- Batch disable-all with critical component protection
- Conservative heuristics to avoid false positives


### Command Library

- Save frequently used ADB commands with name, category, and risk level
- Execute saved commands directly
- Favorites system
- Export/import command libraries as JSON

### Activity Log


### Theme System

- 7 built-in presets: VOID, NEON PURPLE, CYBER BLUE, LAIN, MATRIX, NIGHT CITY, TERMINAL
- Visual Theme Editor for custom colors, glow, scanlines, glitch effects, font, density
- Persistent via `~/.config/detoxification-control/theme.json`
- Export/import themes as JSON
- Reduced motion option via localStorage

### Internationalization

- 3 languages: Portuguese (default), English, Spanish
- Language selector in Settings
- Persisted in localStorage

## Important ⚠️

🔌 Preparing an Android Device
Enable:
Developer Options
USB Debugging
Connect the device and verify:
adb devices
The device should appear as:
<serial>    device
If Android asks:
Allow USB debugging?
accept the authorization.
