"use client"

/**
 * Minimal UI translation. Portuguese is the source language: components call
 * `t("Texto em português")` and English comes from a PT→EN dictionary. A missing
 * entry falls back to the Portuguese text, so nothing ever renders empty.
 *
 * Placeholders use `{name}`: `t("Olá, {name}", { name })`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { enUS, ptBR } from "date-fns/locale"
import { EN_COMMON } from "./locales/en-common"
import { EN_ACCOUNTS } from "./locales/en-accounts"
import { EN_COMMUNITY } from "./locales/en-community"
import { EN_AUTOMATIONS } from "./locales/en-automations"
import { EN_ANALYTICS } from "./locales/en-analytics"

export type Lang = "pt" | "en"
export type TranslateVars = Record<string, string | number | null | undefined>
export type Translate = (pt: string, vars?: TranslateVars) => string

export const LANG_STORAGE_KEY = "instacommand_lang"
// Must match `metadata.title` in app/layout.tsx.
const PT_TITLE = "InstaCommand - Gestão Inteligente de Instagram"
const EN_TITLE = "InstaCommand - Smart Instagram Management"

const EN: Record<string, string> = { ...EN_COMMON, ...EN_ACCOUNTS, ...EN_COMMUNITY, ...EN_AUTOMATIONS, ...EN_ANALYTICS }

// Mirrors the provider so plain functions (formatters, toasts outside React) can translate too.
let currentLang: Lang = "pt"

const fill = (text: string, vars?: TranslateVars) =>
  vars ? text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key] ?? "") : match)) : text

/**
 * A "context::" prefix disambiguates the same Portuguese word with different English
 * meanings, e.g. t("período::Início") → "Start" while t("Início") → "Home". The prefix is
 * never shown: Portuguese (and any missing entry) renders the text after "::".
 */
function translate(lang: Lang, pt: string, vars?: TranslateVars) {
  const sep = pt.indexOf("::")
  const base = sep >= 0 ? pt.slice(sep + 2) : pt
  return fill(lang === "en" ? EN[pt] ?? EN[base] ?? base : base, vars)
}

/** Translate outside React (module helpers, callbacks). Prefer `useT()` inside components. */
export const tr: Translate = (pt, vars) => translate(currentLang, pt, vars)
export const getLang = () => currentLang
/** Meta and Threads login pages follow a locale parameter; keep them in the app language. */
export const withAuthLocale = (url: string) => currentLang === "en" ? url + (url.includes("?") ? "&" : "?") + "locale=en_US&hl=en" : url
/** BCP 47 locale for Intl / toLocaleString. */
export const localeFor = (lang: Lang) => (lang === "en" ? "en-US" : "pt-BR")
export const currentLocale = () => localeFor(currentLang)
/** date-fns locale object. */
export const dateFnsLocaleFor = (lang: Lang) => (lang === "en" ? enUS : ptBR)
export const currentDateFnsLocale = () => dateFnsLocaleFor(currentLang)

const parseLang = (value: string | null | undefined): Lang | null => {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return null
  if (normalized.startsWith("en")) return "en"
  if (normalized.startsWith("pt")) return "pt"
  return null
}

type LanguageContextValue = { lang: Lang; setLang: (lang: Lang) => void }
const LanguageContext = createContext<LanguageContextValue>({ lang: "pt", setLang: () => undefined })

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("pt")

  const setLang = useCallback((next: Lang) => {
    currentLang = next
    try { window.localStorage.setItem(LANG_STORAGE_KEY, next) } catch { /* storage unavailable */ }
    setLangState(next)
  }, [])

  // Read the choice after mount so server and first client render agree (Portuguese).
  useEffect(() => {
    let fromUrl: Lang | null = null
    try { fromUrl = parseLang(new URLSearchParams(window.location.search).get("lang")) } catch { /* ignore */ }
    let stored: Lang | null = null
    try { stored = parseLang(window.localStorage.getItem(LANG_STORAGE_KEY)) } catch { /* ignore */ }
    const initial = fromUrl ?? stored
    if (fromUrl) {
      try { window.localStorage.setItem(LANG_STORAGE_KEY, fromUrl) } catch { /* ignore */ }
    }
    if (initial && initial !== currentLang) {
      currentLang = initial
      setLangState(initial)
    }
  }, [])

  useEffect(() => {
    currentLang = lang
    document.documentElement.lang = lang === "en" ? "en" : "pt-BR"
    // The static metadata title is Portuguese; swap it for the English one while English is on.
    if (document.title === PT_TITLE || document.title === EN_TITLE) document.title = lang === "en" ? EN_TITLE : PT_TITLE
  }, [lang])

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

/** Current language plus setter and locale helpers. */
export function useLang() {
  const { lang, setLang } = useContext(LanguageContext)
  return { lang, setLang, locale: localeFor(lang), dateLocale: dateFnsLocaleFor(lang) }
}

/** Returns `t(ptString, vars?)` bound to the current language. */
export function useT(): Translate {
  const { lang } = useContext(LanguageContext)
  return useCallback<Translate>((pt, vars) => translate(lang, pt, vars), [lang])
}

/** PT | EN segmented switch. `compact` renders the small variant for headers/footers. */
export function LanguageSwitch({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const { lang, setLang } = useLang()
  const t = useT()
  const options: Array<{ value: Lang; label: string; title: string }> = [
    { value: "pt", label: "PT", title: "Português" },
    { value: "en", label: "EN", title: "English" },
  ]
  return (
    <div role="group" aria-label={t("Idioma")} className={`inline-flex shrink-0 items-center rounded-lg border border-slate-200 bg-white p-0.5 ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={lang === option.value}
          onClick={() => setLang(option.value)}
          className={`${compact ? "h-7 min-w-8 px-1.5 text-[11px]" : "h-9 min-w-12 px-3 text-xs"} rounded-md font-bold transition-colors ${lang === option.value ? "bg-indigo-600 text-white shadow-xs" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
