# Instalação — Fedora

## Dependências do sistema (Fedora)

```bash
sudo dnf install -y \
  gtk3-devel webkit2gtk4.1-devel \
  glib2-devel libappindicator-gtk3-devel librsvg2-devel patchelf \
  android-tools            # adb + fastboot
```

## Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

## Node

Fedora (v42+) inclui Node 22:
```bash
sudo dnf install -y nodejs npm
```

## Dependências do projeto

```bash
cd android-quest-manager
cd frontend && npm install && cd ..
```

## Executar (dev)

```bash
./scripts/dev.sh
```

## Empacotar (RPM / AppImage / deb — Fase 6)

Requisitos de empacotamento:

```bash
sudo dnf install -y rpm-build dpkg librsvg2-devel   # rpmbuild, dpkg-deb, AppImage (gtk plugin)
```

Build release (gera pacotes em `dist/`):

```bash
./scripts/build-release.sh            # RPM (padrão)
./scripts/build-release.sh appimage   # AppImage
./scripts/build-release.sh deb        # DEB
./scripts/build-release.sh rpm deb appimage
```

Instalação do RPM:

```bash
sudo dnf install dist/detoxification-control-0.1.0-1.x86_64.rpm
```

AppImage: basta dar permissão de execução e rodar:

```bash
chmod +x dist/*.AppImage
./dist/*.AppImage
```

## Permissões USB (udev)

O `adb` do pacote `android-tools` já inclui regras udev para Android. Se um
dispositivo não for detectado:

```bash
lsusb                        # anote o VendorID/ProductID
sudo vim /etc/udev/rules.d/51-android.rules
# ATTR{idVendor}=="XXXX", ATTR{idProduct}=="YYYY", MODE="0666"
sudo udevadm control --reload-rules && sudo udevadm trigger
```

> DETOXIFICATION CONTROL não exige sudo para operações normais (tudo via adb do usuário).

## Configuração do dispositivo (Android / Quest)

1. Ative o **Developer Mode** (Quest: app Meta Horizon → Settings → Developer Mode).
2. Ative **USB debugging** (Developer Options → USB debugging).
3. Conecte por USB e **autorize este computador** no prompt do dispositivo.
4. Para Wi-Fi: `adb tcpip 5555` + `adb connect <ip>:5555`.
