import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_LANG, dicts, type Lang } from "../i18n/dicts";

const LANG_KEY = "detoxification.lang";

export type I18nParams = Record<string, string | number>;

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: I18nParams) => string;
}

const Ctx = createContext<I18nCtx>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (k: string) => k,
});

function interpolate(str: string, params: I18nParams): string {
  return str.replace(/\{(\w+)\}/g, (_, k: string) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`,
  );
}

function isLang(v: string | null): v is Lang {
  return v === "en" || v === "pt" || v === "es";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LANG_KEY);
    return isLang(saved) ? saved : DEFAULT_LANG;
  });

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(LANG_KEY, l);
    setLangState(l);
  }, []);

  const t = useCallback(
    (key: string, params?: I18nParams) => {
      const str = lang === "en" ? key : (dicts[lang][key] ?? key);
      return params ? interpolate(str, params) : str;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}
