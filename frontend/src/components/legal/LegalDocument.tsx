import Link from "next/link"
import { ShieldCheck } from "lucide-react"

const links = [
  { href: "/politica-de-privacidade", label: "Privacidade" },
  { href: "/termos-de-servico", label: "Termos" },
  { href: "/exclusao-de-dados", label: "Exclusão de dados" },
]

export function LegalDocument({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh w-full bg-slate-50 px-4 py-6 text-slate-800 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link href="/login" className="inline-flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm"><ShieldCheck size={21}/></span>
            <span><span className="block text-base font-bold tracking-tight text-slate-950">InstaCommand</span><span className="block text-xs text-slate-500">Informações do serviço</span></span>
          </Link>
          <Link href="/login" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700">Voltar ao acesso</Link>
        </header>

        <nav aria-label="Documentos do InstaCommand" className="mb-5 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
          {links.map((link) => <Link key={link.href} href={link.href} className={`rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-indigo-50 hover:text-indigo-700 ${link.href === currentPath(title) ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}>{link.label}</Link>)}
        </nav>

        <article className="rounded-2xl border border-slate-200 bg-white px-5 py-7 shadow-sm sm:px-9 sm:py-9">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">InstaCommand · UX Code</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
          <p className="mt-4 text-xs text-slate-400">Última atualização: 24 de setembro de 2026</p>
          <div className="mt-7 space-y-7 text-sm leading-7 text-slate-700 [&_h2]:text-base [&_h2]:font-bold [&_h2]:leading-6 [&_h2]:text-slate-900 [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-slate-800 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
            {children}
          </div>
        </article>

        <footer className="mt-5 rounded-xl border border-slate-200 bg-white px-5 py-4 text-xs leading-5 text-slate-500">
          <p className="font-semibold text-slate-700">UX Code Desenvolvimento Web · CNPJ 66.650.579/0001-46</p>
          <p>R. Visconde do Rio Branco, 1488, Conj. 909, Centro, Curitiba/PR, 80420-210.</p>
          <p className="mt-2">Canal de contato: <a className="font-semibold text-indigo-600 underline underline-offset-2" href="https://uxcode.com.br/#contato" target="_blank" rel="noreferrer">uxcode.com.br/contato</a>. O InstaCommand não é afiliado, patrocinado ou administrado pela Meta.</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {links.map((link) => <Link key={link.href} href={link.href} className="text-indigo-600 underline underline-offset-2">{link.label}</Link>)}
          </div>
        </footer>
      </div>
    </div>
  )
}

function currentPath(title: string) {
  if (title === "Política de Privacidade") return "/politica-de-privacidade"
  if (title === "Termos de Serviço") return "/termos-de-servico"
  return "/exclusao-de-dados"
}
