import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AqmError,
  ApkInfo,
  AppInfo,
  BackupEntry,
  BackupSummary,
  CmdOut,
  DebloatReport,
  DebloatResult,
  Device,
  DeviceInfo,
  FastbootDevice,
  FsEntry,
  LogEntry,
  LogcatLine,
  LogcatStopped,
  PackageAction,
  PackageDetail,
  PerfSnapshot,
  PerfState,
  PerformanceTweak,
  PreviewResult,
  QuestStatus,
  QuestVersion,
  RecordOpts,
  RecordStarted,
  RecordStopped,
  SavedCommand,
  ScreenInput,
  ScreenToolsState,
  ServiceProcess,
  TelemetryComponent,
  TelemetryResult,
  Theme,
  TransferDone,
  TransferProgress,
} from "./types";

export function toError(e: unknown): AqmError {
  if (typeof e === "object" && e !== null) {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") {
      return {
        message: o.message,
        detail: typeof o.detail === "string" ? o.detail : undefined,
      };
    }
  }
  if (typeof e === "string") return { message: e };
  return { message: String(e) };
}

export const api = {
  adbPath: () => invoke<string>("adb_path"),
  adbVersion: () => invoke<string>("adb_version"),
  adbExecute: (args: string[]) => invoke<CmdOut>("adb_execute", { args }),
  devicesList: () => invoke<Device[]>("devices_list"),
  refreshDevices: () => invoke<Device[]>("refresh_devices"),
  deviceInfo: (serial: string) => invoke<DeviceInfo>("device_info", { serial }),
  terminalExecute: (input: string, serial?: string) =>
    invoke<CmdOut>("terminal_execute", { input, serial }),
  getSettings: () => invoke<Record<string, unknown>>("get_settings"),

  // ---- Packages / APK ----
  packagesList: (serial: string, force?: boolean) =>
    invoke<AppInfo[]>("packages_list", { serial, force }),
  packageDetail: (serial: string, packageName: string) =>
    invoke<PackageDetail>("package_detail_cmd", { serial, package: packageName }),
  packageAction: (serial: string, packageName: string, action: PackageAction, system?: boolean) =>
    invoke<void>("package_action", { serial, package: packageName, action, system }),
  packageExport: (serial: string, packageName: string, destDir: string) =>
    invoke<string[]>("package_export", { serial, package: packageName, destDir }),
  permissionSet: (serial: string, packageName: string, permission: string, grant: boolean) =>
    invoke<void>("permission_set", { serial, package: packageName, permission, grant }),
  apkAnalyze: (path: string) => invoke<ApkInfo>("apk_analyze", { path }),
  packageInstall: (serial: string, paths: string[], replace?: boolean, grantAll?: boolean) =>
    invoke<string>("package_install", { serial, paths, replace, grantAll }),
  transferCancel: (token: string) => invoke<boolean>("transfer_cancel", { token }),

  // ---- Filesystem ----
  fsList: (serial: string, path: string) => invoke<FsEntry[]>("fs_list", { serial, path }),
  fsMkdir: (serial: string, path: string) => invoke<void>("fs_mkdir", { serial, path }),
  fsTouch: (serial: string, path: string) => invoke<void>("fs_touch", { serial, path }),
  fsRename: (serial: string, from: string, to: string) =>
    invoke<void>("fs_rename", { serial, from, to }),
  fsCopy: (serial: string, from: string, to: string) => invoke<void>("fs_copy", { serial, from, to }),
  fsDelete: (serial: string, path: string) => invoke<void>("fs_delete", { serial, path }),
  fsUpload: (serial: string, local: string, remote: string) =>
    invoke<string>("fs_upload", { serial, local, remote }),
  fsDownload: (serial: string, remote: string, local: string) =>
    invoke<string>("fs_download", { serial, remote, local }),

  // ---- Fase 3: tools ----
  screenshotTake: (serial: string, destDir: string) =>
    invoke<string>("screenshot_take", { serial, destDir }),
  recordStart: (serial: string, opts: RecordOpts) =>
    invoke<RecordStarted>("record_start", { serial, opts }),
  recordStop: (token: string) => invoke<string>("record_stop", { token }),
  recordPull: (serial: string, remote: string, local: string) =>
    invoke<void>("record_pull", { serial, remote, local }),
  logcatStart: (serial: string) => invoke<string>("logcat_start", { serial }),
  logcatStop: () => invoke<void>("logcat_stop"),
  logcatClear: (serial: string) => invoke<void>("logcat_clear", { serial }),
  logcatSnapshot: () => invoke<string[]>("logcat_snapshot"),
  saveTextFile: (path: string, content: string) =>
    invoke<void>("save_text_file", { path, content }),
  perfSnapshot: (serial: string) => invoke<PerfSnapshot>("perf_snapshot", { serial }),

  // ---- Fase 4: Wi-Fi ----
  wifiConnect: (host: string, port?: number) =>
    invoke<string>("wifi_connect", { host, port }),
  wifiDisconnect: (serial?: string) =>
    invoke<void>("wifi_disconnect", { serial }),
  wifiPair: (host: string, port: number, code: string) =>
    invoke<void>("wifi_pair", { host, port, code }),
  wifiEnableTcpip: (serial: string, port?: number) =>
    invoke<void>("wifi_enable_tcpip", { serial, port }),
  wifiDeviceIp: (serial: string) =>
    invoke<string>("wifi_device_ip", { serial }),

  // ---- Fase 4: Backup ----
  backupCreate: (
    serial: string,
    packages: string[],
    destDir: string,
    includeApk?: boolean,
    includeData?: boolean,
  ) =>
    invoke<BackupSummary>("backup_create", {
      serial,
      packages,
      destDir,
      includeApk,
      includeData,
    }),
  backupList: (baseDir: string) => invoke<BackupEntry[]>("backup_list", { baseDir }),
  backupRestore: (serial: string, backupDir: string, packages?: string[]) =>
    invoke<string[]>("backup_restore", { serial, backupDir, packages }),

  // ---- Fase 5: Quest ----
  questStatus: (serial: string) => invoke<QuestStatus>("quest_status", { serial }),
  questSetFpsCounter: (serial: string, on: boolean) =>
    invoke<void>("quest_set_fps_counter", { serial, on }),
  questSetPhoneSdk: (serial: string, on: boolean) =>
    invoke<void>("quest_set_phone_sdk", { serial, on }),
  questSetSlowSdk: (serial: string, on: boolean) =>
    invoke<void>("quest_set_slow_sdk", { serial, on }),
  questSetGuardian: (serial: string, on: boolean) =>
    invoke<void>("quest_set_guardian", { serial, on }),
  questRestartVrShell: (serial: string) =>
    invoke<void>("quest_restart_vr_shell", { serial }),
  questOpenStore: (serial: string) => invoke<void>("quest_open_store", { serial }),
  deviceReboot: (serial: string, mode?: string) =>
    invoke<void>("device_reboot", { serial, mode }),
  fastbootList: () => invoke<FastbootDevice[]>("fastboot_list"),
  fastbootReboot: (serial: string, mode?: string) =>
    invoke<void>("fastboot_reboot", { serial, mode }),

  // ---- Fase 7: Temas ----
  themeGet: () => invoke<Theme>("theme_get"),
  themeSet: (theme: Theme) => invoke<Theme>("theme_set", { theme }),
  themePresets: () => invoke<Theme[]>("theme_presets"),
  themeExport: () => invoke<string>("theme_export"),
  themeImport: (json: string) => invoke<Theme>("theme_import", { json }),

  // ---- Fase 7: Command Library ----
  cmdlibList: () => invoke<SavedCommand[]>("cmdlib_list"),
  cmdlibSave: (cmd: SavedCommand) => invoke<SavedCommand>("cmdlib_save", { cmd }),
  cmdlibDelete: (id: string) => invoke<void>("cmdlib_delete", { id }),
  cmdlibToggleFavorite: (id: string) => invoke<SavedCommand>("cmdlib_toggle_favorite", { id }),
  cmdlibExecute: (serial: string, id: string) =>
    invoke<CmdOut>("cmdlib_execute", { serial, id }),
  cmdlibExport: () => invoke<string>("cmdlib_export"),
  cmdlibImport: (json: string) => invoke<number>("cmdlib_import", { json }),

  // ---- Fase 7: Activity Log ----
  logList: (filter?: string) => invoke<LogEntry[]>("log_list", { filter }),
  logClear: () => invoke<void>("log_clear"),
  logExport: () => invoke<string>("log_export"),

  // ---- Fase 7: Quest Optimizer ----
  optimizerDetect: (serial: string) => invoke<QuestVersion>("optimizer_detect", { serial }),
  optimizerTelemetryScan: (serial: string) =>
    invoke<TelemetryComponent[]>("optimizer_telemetry_scan", { serial }),
  optimizerTelemetryToggle: (serial: string, pkg: string, disable: boolean) =>
    invoke<void>("optimizer_telemetry_toggle", { serial, pkg, disable }),
  optimizerTelemetryDisableAll: (serial: string) =>
    invoke<TelemetryResult[]>("optimizer_telemetry_disable_all", { serial }),
  optimizerProcesses: (serial: string) =>
    invoke<ServiceProcess[]>("optimizer_processes", { serial }),
  optimizerTweaks: (serial: string) =>
    invoke<PerformanceTweak[]>("optimizer_tweaks", { serial }),
  optimizerApplyTweak: (serial: string, key: string, value: string) =>
    invoke<void>("optimizer_apply_tweak", { serial, key, value }),

  // ---- Fase 7: Quest Debloat ----
  debloatAnalyze: (serial: string) => invoke<DebloatReport>("debloat_analyze", { serial }),
  debloatToggle: (serial: string, pkg: string, disable: boolean) =>
    invoke<void>("debloat_toggle", { serial, pkg, disable }),
  debloatApply: (serial: string, packages: string[], disable: boolean) =>
    invoke<DebloatResult[]>("debloat_apply", { serial, packages, disable }),
  debloatInfo: (serial: string, pkg: string) =>
    invoke<PackageDetail>("debloat_info", { serial, pkg }),

  // ---- Fase 7: Screen Tools ----
  screenToolsState: (serial: string) =>
    invoke<ScreenToolsState>("screen_tools_state", { serial }),
  screenVolumeSet: (serial: string, stream: string, value: number) =>
    invoke<void>("screen_volume_set", { serial, stream, value }),
  screenBrightnessSet: (serial: string, value: number) =>
    invoke<void>("screen_brightness_set", { serial, value }),
  screenPreview: (serial: string) => invoke<PreviewResult>("screen_preview", { serial }),
  screenSendInput: (serial: string, input: ScreenInput) =>
    invoke<void>("screen_send_input", { serial, input }),

  // ---- Fase 8: Quest Performance (CPU/GPU/FFR/resolução) ----
  perfState: (serial: string) => invoke<PerfState>("perf_state", { serial }),
  perfSetCpu: (serial: string, level: number, dynamic: boolean) =>
    invoke<void>("perf_set_cpu", { serial, level, dynamic }),
  perfSetGpu: (serial: string, level: number, dynamic: boolean) =>
    invoke<void>("perf_set_gpu", { serial, level, dynamic }),
  perfSetFfr: (serial: string, level: number, dynamic: boolean) =>
    invoke<void>("perf_set_ffr", { serial, level, dynamic }),
  perfSetResolution: (serial: string, width: number, height: number) =>
    invoke<void>("perf_set_resolution", { serial, width, height }),
  perfResetResolution: (serial: string) => invoke<void>("perf_reset_resolution", { serial }),
  perfResetAll: (serial: string) => invoke<void>("perf_reset_all", { serial }),
};

// ---- Eventos de transferência (install/upload/download) ----

export function onTransferProgress(
  cb: (p: TransferProgress) => void,
): Promise<UnlistenFn> {
  return listen<TransferProgress>("transfer:progress", (e) => cb(e.payload));
}

export function onTransferDone(cb: (d: TransferDone) => void): Promise<UnlistenFn> {
  return listen<TransferDone>("transfer:done", (e) => cb(e.payload));
}

// ---- Eventos da Fase 3 ----

export function onLogcatLine(cb: (l: LogcatLine) => void): Promise<UnlistenFn> {
  return listen<LogcatLine>("logcat:line", (e) => cb(e.payload));
}

export function onLogcatStopped(cb: (s: LogcatStopped) => void): Promise<UnlistenFn> {
  return listen<LogcatStopped>("logcat:stopped", (e) => cb(e.payload));
}

export function onRecordStopped(cb: (s: RecordStopped) => void): Promise<UnlistenFn> {
  return listen<RecordStopped>("record:stopped", (e) => cb(e.payload));
}

// ---- Eventos da Fase 7 ----

export function onLogEntry(cb: (e: LogEntry) => void): Promise<UnlistenFn> {
  return listen<LogEntry>("log:entry", (e) => cb(e.payload));
}
