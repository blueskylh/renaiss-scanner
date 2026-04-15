import { useState, useEffect, useCallback } from "react"
import zhCN from "./locales/zh-CN"
import zhTW from "./locales/zh-TW"
import en from "./locales/en"
import ja from "./locales/ja"
import ko from "./locales/ko"

export type Locale = "zh-CN" | "zh-TW" | "en" | "ja" | "ko"
type Messages = Record<string, string>

const messages: Record<Locale, Messages> = {
  "zh-CN": zhCN as Messages,
  "zh-TW": zhTW as Messages,
  en: en as Messages,
  ja: ja as Messages,
  ko: ko as Messages,
}

export const localeLabels: Record<Locale, string> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
}

const STORAGE_KEY = "renaiss-locale"

function detectLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && saved in messages) return saved as Locale

  const lang = navigator.language || "en"
  if (lang.startsWith("zh")) {
    return lang.includes("TW") || lang.includes("HK") || lang.includes("Hant")
      ? "zh-TW"
      : "zh-CN"
  }
  if (lang.startsWith("ja")) return "ja"
  if (lang.startsWith("ko")) return "ko"
  return "en"
}

export function useI18n() {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem(STORAGE_KEY, l)
    setLocaleState(l)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let text = messages[locale]?.[key] ?? messages["zh-CN"][key] ?? key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, String(v))
        }
      }
      return text
    },
    [locale],
  )

  return { t, locale, setLocale, locales: Object.keys(messages) as Locale[] }
}
