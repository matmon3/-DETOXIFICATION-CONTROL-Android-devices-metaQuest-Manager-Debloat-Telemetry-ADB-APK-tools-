import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, toError } from "../api/bridge";
import type { Theme } from "../api/types";

interface ThemeCtx {
  theme: Theme;
  presets: Theme[];
  applyPreset: (name: string) => Promise<void>;
  save: (t: Theme) => Promise<void>;
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => void;
  error: string | null;
}

const Ctx = createContext<ThemeCtx>({
  theme: {} as Theme,
  presets: [],
  applyPreset: async () => {},
  save: async () => {},
  reduceMotion: false,
  setReduceMotion: () => {},
  error: null,
});

// ---------- color math ----------

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [139, 92, 246];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgb(r: [number, number, number]) {
  return `#${r.map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

function shade(hex: string, f: number) {
  const [r, g, b] = toRgb(hex);
  return rgb([r * f, g * f, b * f]);
}

function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  return rgb([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]);
}

function rgba(hex: string, a: number) {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const FONTS: Record<string, string> = {
  "JetBrains Mono": '"JetBrains Mono", ui-monospace, monospace',
  "Fira Code": '"Fira Code", ui-monospace, monospace',
  "IBM Plex Mono": '"IBM Plex Mono", ui-monospace, monospace',
  "DejaVu Sans Mono": '"DejaVu Sans Mono", ui-monospace, monospace',
  "Ubuntu Mono": '"Ubuntu Mono", ui-monospace, monospace',
};

function applyTheme(t: Theme) {
  const root = document.documentElement.style;
  const g = Math.min(1, Math.max(0, t.glow / 100));
  const s = Math.min(1, Math.max(0, t.scanlines / 100));
  const gl = Math.min(1, Math.max(0, t.glitch / 100));
  const a = Math.min(1, Math.max(0, t.animations / 100));
  const density = Math.min(1, Math.max(0.6, t.density / 100));

  // Panel transparency blends panel towards background.
  const trans = Math.min(0.92, Math.max(0, t.transparency / 100));
  const panel = mix(t.panel, t.background, trans);
  const panel2 = shade(panel, 1.07);

  root.setProperty("--purple", t.primary);
  root.setProperty("--purple-dark", shade(t.primary, 0.55));
  root.setProperty("--purple-neon", mix(t.primary, "#ffffff", 0.12));
  root.setProperty("--secondary", t.secondary);
  root.setProperty("--accent", t.accent);
  root.setProperty("--bg", t.background);
  root.setProperty("--bg-2", shade(t.background, 1.06));
  root.setProperty("--panel", panel);
  root.setProperty("--panel-2", panel2);
  root.setProperty("--border", mix(panel, t.primary, 0.16));
  root.setProperty("--border-bright", mix(panel, t.primary, 0.34));
  root.setProperty("--text", t.text);
  root.setProperty("--text-dim", mix(t.text, t.background, 0.42));
  root.setProperty("--text-faint", mix(t.text, t.background, 0.68));
  root.setProperty("--font-mono", FONTS[t.font] ?? FONTS["JetBrains Mono"]);
  root.setProperty("--font-sans", FONTS[t.font] ?? FONTS["JetBrains Mono"]);
  root.setProperty("--font-size", `${Math.max(10, Math.min(20, t.font_size))}px`);
  root.setProperty("--radius", `${t.radius}px`);
  root.setProperty("--radius-lg", `${t.radius + 3}px`);
  root.setProperty("--border-w", `${Math.max(1, t.border_width)}px`);
  root.setProperty("--glow", String(g));
  root.setProperty("--scan", String(s));
  root.setProperty("--glitch", String(gl));
  root.setProperty("--anim", String(a));
  root.setProperty("--sp", String(density));
  root.setProperty("--panel-alpha", rgba(panel, 1 - trans * 0.5));

  const reduced = localStorage.getItem("detoxification.reduceMotion") === "1";
  document.documentElement.classList.toggle("reduce-motion", reduced || a < 0.1);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [presets, setPresets] = useState<Theme[]>([]);
  const [reduceMotion, setReduceMotionState] = useState(
    localStorage.getItem("detoxification.reduceMotion") === "1",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [t, p] = await Promise.all([api.themeGet(), api.themePresets()]);
        setTheme(t);
        setPresets(p);
        applyTheme(t);
      } catch (e) {
        setError(toError(e).message);
      }
    })();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
  }, [reduceMotion]);

  const save = useCallback(async (t: Theme) => {
    const saved = await api.themeSet(t);
    setTheme(saved);
    applyTheme(saved);
  }, []);

  const applyPreset = useCallback(async (name: string) => {
    const preset = presets.find((p) => p.name.toUpperCase() === name.toUpperCase());
    if (!preset) return;
    await save({ ...preset });
  }, [presets, save]);

  const setReduceMotion = useCallback((v: boolean) => {
    localStorage.setItem("detoxification.reduceMotion", v ? "1" : "0");
    setReduceMotionState(v);
  }, []);

  const value = useMemo(
    () => ({
      theme: theme ?? ({
        name: "NEON PURPLE",
        primary: "#A855F7",
        secondary: "#7C3AED",
        accent: "#FF2D95",
        text: "#F0EFFF",
        background: "#08060E",
        panel: "#120D1E",
        glow: 85,
        scanlines: 30,
        glitch: 25,
        animations: 80,
        transparency: 0,
        border_width: 1,
        radius: 2,
        font: "JetBrains Mono",
        font_size: 13,
        density: 55,
      } as Theme),
      presets,
      applyPreset,
      save,
      reduceMotion,
      setReduceMotion,
      error,
    }),
    [theme, presets, applyPreset, save, reduceMotion, setReduceMotion, error],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
