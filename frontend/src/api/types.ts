export type DeviceState =
  | "connected"
  | "unauthorized"
  | "offline"
  | "bootloader"
  | "recovery"
  | "disconnected"
  | "unknown";

export type Transport = "usb" | "wifi" | "fastboot" | "unknown";

export interface Device {
  serial: string;
  state: DeviceState;
  transport: Transport;
  model: string | null;
  product: string | null;
  codename: string | null;
  transport_id: string | null;
}

export interface StorageInfo {
  total: number;
  used: number;
  free: number;
  mount: string;
}

export interface ScreenInfo {
  width: number;
  height: number;
  density: number;
  refresh_rate: number | null;
}

export interface DeviceInfo {
  serial: string;
  model: string | null;
  manufacturer: string | null;
  brand: string | null;
  codename: string | null;
  android_version: string | null;
  sdk: string | null;
  security_patch: string | null;
  build: string | null;
  fingerprint: string | null;
  abi: string | null;
  bootloader: string | null;
  hardware: string | null;
  battery_level: number | null;
  battery_status: string | null;
  battery_temperature_c: number | null;
  storage: StorageInfo | null;
  ram_total_mb: number | null;
  screen: ScreenInfo | null;
  ip: string | null;
  root: boolean;
  developer_mode: boolean;
  quest: boolean;
  headset: string | null;
  firmware: string | null;
}

export interface CmdOut {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timed_out: boolean;
}

export interface AqmError {
  message: string;
  detail?: string | null;
}

export type PackageAction =
  | "launch"
  | "stop"
  | "clearData"
  | "clearCache"
  | "disable"
  | "enable"
  | "uninstall"
  | "openSettings";

/** Informação resumida de um pacote instalado (lista). */
export interface AppInfo {
  package: string;
  versionName: string;
  versionCode: number | null;
  installDate: string | null;
  updateDate: string | null;
  sizeBytes: number;
  isSystem: boolean;
  disabled: boolean;
  codePath: string;
  minSdk: number | null;
  targetSdk: number | null;
}

/** Estado de uma permissão do pacote. */
export interface PermissionState {
  name: string;
  granted: boolean;
  flags: string;
}

/** Detalhes completos de um pacote (tela de detalhes). */
export interface PackageDetail {
  package: string;
  uid: number | null;
  versionName: string;
  versionCode: number | null;
  minSdk: number | null;
  targetSdk: number | null;
  firstInstallTime: string | null;
  lastUpdateTime: string | null;
  codePath: string;
  dataDir: string;
  nativeLibraryDir: string;
  primaryCpuAbi: string;
  isSystem: boolean;
  disabled: boolean;
  permissions: PermissionState[];
  activities: string[];
  services: string[];
  receivers: string[];
  providers: string[];
}

/** Analyzer de APK local (antes de instalar). */
export interface ApkInfo {
  fileName: string;
  fileSize: number;
  package: string;
  versionName: string;
  versionCode: number | null;
  minSdk: number | null;
  targetSdk: number | null;
  permissions: string[];
  features: string[];
  activities: string[];
  services: string[];
  receivers: string[];
  providers: string[];
  abis: string[];
  signature: string;
}

/** Entrada do file manager remoto. */
export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number;
  perms: string;
  uid: number;
  gid: number;
  mtime: string;
  parent: string;
}

export interface TransferProgress {
  token: string;
  pct: number | null;
  line: string | null;
}

export interface TransferDone {
  token: string;
  ok: boolean;
  message: string;
  detail: string | null;
}

// ---- Fase 3: screenshot / record / logcat / performance ----

export interface RecordOpts {
  size?: string;
  bitrate?: string;
  fps?: string;
  timeLimit?: number;
}

export interface RecordStarted {
  token: string;
  remotePath: string;
}

export interface RecordStopped {
  token: string;
  ok: boolean;
  message: string;
  remotePath: string | null;
}

export interface LogcatLine {
  serial: string;
  line: string;
}

export interface LogcatStopped {
  reason: string;
}

export interface PerfProcess {
  pid: string;
  name: string;
  cpu: number;
}

export interface PerfStorage {
  total: number;
  used: number;
  free: number;
  mount: string;
}

export interface PerfSnapshot {
  cpuLoad: string;
  cpuTotal: number;
  processes: PerfProcess[];
  memTotalKb: number;
  memFreeKb: number;
  memAvailKb: number;
  batteryLevel: number | null;
  batteryStatus: string | null;
  batteryTempC: number | null;
  storage: PerfStorage | null;
  uptimeS: number | null;
}

// ---- Fase 4: Wi-Fi ----

export interface WifiConnectResult {
  serial: string;
}

// ---- Fase 4: Backup ----

export interface BackupSummary {
  dir: string;
  timestamp: string;
  packages: string[];
  apkCount: number;
  dataDirs: string[];
}

export interface BackupEntry {
  dir: string;
  name: string;
  serial: string;
  timestamp: string;
  packageCount: number;
  apkCount: number;
  hasData: boolean;
}

// ---- Fase 5: Quest ----

export interface QuestStatus {
  serial: string;
  batteryLevel: number | null;
  batteryTempC: number | null;
  fpsCounter: boolean;
  phoneSdk: boolean;
  slowSdk: boolean;
  guardianEnabled: boolean;
  vrShellRunning: boolean;
  powerSave: boolean;
}

export interface FastbootDevice {
  serial: string;
  mode: string;
}

// ---- Fase 7: DETOXIFICATION CONTROL ----

export interface Theme {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  background: string;
  panel: string;
  glow: number;
  scanlines: number;
  glitch: number;
  animations: number;
  transparency: number;
  border_width: number;
  radius: number;
  font: string;
  font_size: number;
  density: number;
}

export interface SavedCommand {
  id: string;
  name: string;
  command: string;
  device: string;
  category: string;
  risk: string;
  favorite: boolean;
  created: string;
  updated: string;
}

export interface LogEntry {
  id: number;
  time: string;
  device: string;
  kind: string;
  command: string;
  result: string;
  exit_code: number | null;
  error: string | null;
  operation: string;
}

export interface QuestVersion {
  serial: string;
  model: string | null;
  headset: string | null;
  androidVersion: string | null;
  osVersion: string | null;
  isQuest: boolean;
}

export interface TelemetryComponent {
  package: string;
  exists: boolean;
  active: boolean;
  critical: boolean;
  /** "QUEST" | "GOOGLE" | "OEM" | "GENERIC" — origem do componente. */
  source: string;
}

export interface TelemetryResult {
  package: string;
  ok: boolean;
  message: string;
}

export interface ServiceProcess {
  pid: string;
  name: string;
  cpu: number;
  rssMb: number;
  status: string;
  critical: boolean;
}

export interface PerformanceTweak {
  key: string;
  name: string;
  desc: string;
  kind: string;
  value: string;
  current: string | null;
  reversible: boolean;
}

export interface DebloatPackage {
  package: string;
  category: string;
  risk: string;
  disabled: boolean;
  system: boolean;
  critical: boolean;
  recommended: boolean;
  description: string;
}

export interface DebloatReport {
  serial: string;
  headset: string | null;
  model: string | null;
  osVersion: string | null;
  androidVersion: string | null;
  isQuest: boolean;
  total: number;
  disabled: number;
  packages: DebloatPackage[];
}

export interface DebloatResult {
  package: string;
  ok: boolean;
  message: string;
}

export interface ScreenToolsState {
  mediaVolume: number | null;
  ringVolume: number | null;
  alarmVolume: number | null;
  brightness: number | null;
  brightnessMax: number | null;
  screenWidth: number | null;
  screenHeight: number | null;
  density: number | null;
}

export interface PreviewResult {
  path: string;
  width: number | null;
  height: number | null;
  bytes: number;
}

export interface ScreenInput {
  action: "tap" | "swipe" | "key" | "text";
  x?: number | null;
  y?: number | null;
  x2?: number | null;
  y2?: number | null;
  durationMs?: number | null;
  key?: string | null;
  text?: string | null;
}

export interface PerfState {
  cpuLevel: number | null;
  cpuDynamic: boolean;
  gpuLevel: number | null;
  gpuDynamic: boolean;
  ffrLevel: number | null;
  ffrDynamic: boolean;
  textureWidth: number | null;
  textureHeight: number | null;
  panelWidth: number | null;
  panelHeight: number | null;
}
