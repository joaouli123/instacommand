import Link from "next/link"
import { ShieldCheck } from "lucide-react"
import { LegalLanguageJump } from "./LegalLanguageJump"

export type LegalLang = "pt" | "en"
export type LegalDocKey = "privacy" | "terms" | "deletion"

/** Each document is published at a Portuguese URL and at an English alias; both render the same bilingual page. */
export const legalPaths: Record<LegalDocKey, Record<LegalLang, string>> = {
  privacy: { pt: "/politica-de-privacidade", en: "/privacy-policy" },
  terms: { pt: "/termos-de-servico", en: "/terms-of-service" },
  deletion: { pt: "/exclusao-de-dados", en: "/data-deletion" },
}

const links: Array<{ doc: LegalDocKey; label: string; labelEn: string }> = [
  { doc: "privacy", label: "Privacidade", labelEn: "Privacy" },
  { doc: "terms", label: "Termos", labelEn: "Terms" },
  { doc: "deletion", label: "Exclusão de dados", labelEn: "Data deletion" },
]

export const legalLinkClass = "font-semibold text-indigo-600 underline underline-offset-2"

type LegalVersion = { title: string; description: string; body: React.ReactNode }

const versionMeta: Record<LegalLang, { id: string; htmlLang: string; updated: string }> = {
  pt: { id: "portugues", htmlLang: "pt-BR", updated: "Última atualização: 24 de setembro de 2026" },
  en: { id: "english", htmlLang: "en", updated: "Last updated: September 24, 2026" },
}

/**
 * Renders a legal document with its Portuguese and English versions in the same server-rendered HTML,
 * so reviewers and crawlers always see both, with or without JavaScript. `primary` decides which version
 * comes first (Portuguese on the original URLs, English on the English aliases).
 */
export function LegalDocument({
  doc,
  primary,
  pt,
  en,
}: {
  doc: LegalDocKey
  primary: LegalLang
  pt: LegalVersion
  en: LegalVersion
}) {
  const order: LegalLang[] = primary === "pt" ? ["pt", "en"] : ["en", "pt"]
  const versions: Record<LegalLang, LegalVersion> = { pt, en }
  const secondary = order[1]
  const hrefFor = (target: LegalDocKey) => legalPaths[target][primary]

  return (
    <div className="min-h-dvh w-full bg-slate-50 px-4 py-6 text-slate-800 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <p className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-800">
          {secondary === "en"
            ? <a href="#english" lang="en" className="underline underline-offset-2">English version below</a>
            : <a href="#portugues" lang="pt-BR" className="underline underline-offset-2">Versão em português abaixo</a>}
        </p>

        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link href="/login" className="inline-flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm"><ShieldCheck size={21}/></span>
            <span><span className="block text-base font-bold tracking-tight text-slate-950">InstaCommand</span><span className="block text-xs text-slate-500">Informações do serviço · <span lang="en">Service information</span></span></span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Idioma / Language" className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-bold">
              <a href="#portugues" lang="pt-BR" className="rounded-md px-3 py-2 text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700">Português</a>
              <span aria-hidden="true" className="text-slate-300">|</span>
              <a href="#english" lang="en" className="rounded-md px-3 py-2 text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700">English</a>
            </nav>
            <Link href="/login" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700">{primary === "pt" ? "Voltar ao acesso" : "Back to sign in"}</Link>
          </div>
        </header>

        <nav aria-label="Documentos do InstaCommand / InstaCommand documents" className="mb-5 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
          {links.map((link) => <Link key={link.doc} href={hrefFor(link.doc)} className={`rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-indigo-50 hover:text-indigo-700 ${link.doc === doc ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}>{primary === "pt" ? `${link.label} · ${link.labelEn}` : `${link.labelEn} · ${link.label}`}</Link>)}
        </nav>

        <div className="space-y-6">
          {order.map((lang) => {
            const version = versions[lang]
            const meta = versionMeta[lang]
            return (
              <article key={lang} id={meta.id} lang={meta.htmlLang} className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-7 shadow-sm sm:px-9 sm:py-9">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">InstaCommand · UX Code · {lang === "pt" ? "Português" : "English version"}</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{version.title}</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{version.description}</p>
                <p className="mt-4 text-xs text-slate-400">{meta.updated}</p>
                <div className="mt-7 space-y-7 text-sm leading-7 text-slate-700 [&_h2]:text-base [&_h2]:font-bold [&_h2]:leading-6 [&_h2]:text-slate-900 [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-slate-800 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                  {version.body}
                </div>
              </article>
            )
          })}
        </div>

        <footer className="mt-5 rounded-xl border border-slate-200 bg-white px-5 py-4 text-xs leading-5 text-slate-500">
          <p className="font-semibold text-slate-700">UX Code Desenvolvimento Web · CNPJ 66.650.579/0001-46</p>
          <p>R. Visconde do Rio Branco, 1488, Conj. 909, Centro, Curitiba/PR, 80420-210.</p>
          <p className="mt-2" lang="pt-BR">Canal de contato: <a className={legalLinkClass} href="https://uxcode.com.br/#contato" target="_blank" rel="noreferrer">uxcode.com.br/contato</a>. O InstaCommand não é afiliado, patrocinado ou administrado pela Meta.</p>
          <p className="mt-1" lang="en">Contact channel: <a className={legalLinkClass} href="https://uxcode.com.br/#contato" target="_blank" rel="noreferrer">uxcode.com.br/contato</a>. InstaCommand is not affiliated with, sponsored by, or operated by Meta.</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {links.map((link) => <Link key={link.doc} href={legalPaths[link.doc].pt} className="text-indigo-600 underline underline-offset-2">{link.label}</Link>)}
            {links.map((link) => <Link key={`${link.doc}-en`} href={legalPaths[link.doc].en} lang="en" className="text-indigo-600 underline underline-offset-2">{link.labelEn}</Link>)}
          </div>
        </footer>
      </div>
      {primary === "pt" && <LegalLanguageJump />}
    </div>
  )
}
