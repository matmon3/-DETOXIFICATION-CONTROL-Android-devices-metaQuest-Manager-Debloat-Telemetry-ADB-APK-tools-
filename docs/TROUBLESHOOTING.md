# Troubleshooting — DETOXIFICATION CONTROL

## App não abre / janela preta

- `dev.log` na raiz do projeto (modo dev).
- Dependências de dev do webkit/gtk faltando → `sudo dnf install -y webkit2gtk4.1-devel gtk3-devel glib2-devel`.

## Dispositivo não aparece

- USB debugging habilitado? (Developer Options → USB debugging)
- Dispositivo autorizado? Veja no dispositivo o prompt "Allow USB debugging".
- `adb devices` no terminal mostra o dispositivo? Se não, problema de udev/cabo.
- Cabo: prefira USB data (não charge-only).
- Estado `unauthorized` = precisa aceitar o prompt no device.
- Estado `offline` = reconecte o cabo ou `adb kill-server` + `adb devices`.

## DETOXIFICATION CONTROL diz "ADB binary not found"

- `dnf install android-tools`, ou configure `~/.config/detoxification-control/settings.json` → `"adb_path"`.
- Resolução: settings.json → env `DETOXIFICATION CONTROL_ADB` → PATH.

## Quest não detectado como Quest

- A detecção usa `ro.product.model` / fabricante (Meta/Oculus). Firmware muito
  antigo pode não expor. As informações ainda aparecem normalmente.

## Terminal ADB não executa

- Selecione um dispositivo no dropdown do terminal (serial é injetado).
- Comandos `sh`/`bash`/`eval`/`rm`/`dd` no **host** são bloqueados por segurança.
  Use `adb shell <cmd>`.
- Comandos longos (ex.: `logcat` sem filtro) estouram o timeout de 20s → na
  Fase 3 haverá streaming dedicado.

## Compilação lenta

- Primeira compilação compila ~490 crates; depois é incremental.
- Use `-j 4`/`-j 6` se a RAM do sistema estiver em uso.

## Wi-Fi ADB (fase 4 ainda não pronta)

```bash
adb tcpip 5555
adb connect 192.168.x.x:5555
```
O dispositivo aparecerá como transporte `wifi` no DETOXIFICATION CONTROL.
