import Link from "next/link"
import { ProductMark } from "./ProductMark"

/** Both languages are in the initial HTML, without cookies, login, or JavaScript. */
export function ProductOverview() {
  return <div className="min-h-dvh w-full bg-slate-50 px-4 py-6 text-slate-800 sm:px-6 sm:py-10">
    <div className="mx-auto max-w-4xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link href="/sobre" className="flex items-center gap-3"><ProductMark /><span><span className="block text-lg font-bold text-slate-950">UX Code Social</span><span className="block text-xs text-slate-500">UX Code Desenvolvimento Web</span></span></Link>
        <nav aria-label="Idioma / Language" className="flex flex-wrap items-center gap-4 text-sm font-semibold text-indigo-700">
          <a href="#portugues" lang="pt-BR">Português</a><a href="#english" lang="en">English</a>
          <Link href="/login" className="rounded-xl bg-indigo-600 px-4 py-2.5 text-white hover:bg-indigo-700">Entrar / Sign in</Link>
        </nav>
      </header>
      <article id="portugues" lang="pt-BR" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-9">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Produto independente da UX Code</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Gestão de redes sociais, em um só workspace.</h1>
        <p className="mt-4 text-sm leading-7">O UX Code Social é um sistema da UX Code Desenvolvimento Web para planejar publicações, acompanhar métricas e gerenciar interações das contas que você tem autorização para administrar.</p>
        <div className="mt-6 grid gap-4 text-sm leading-6 sm:grid-cols-2">
          <section className="rounded-xl bg-slate-50 p-4"><h2 className="font-bold text-slate-950">O que o sistema faz</h2><p className="mt-2">Calendário e agendamento, relatórios, gestão de comentários e automações de respostas para interações recebidas. Cada recurso depende da rede, das permissões concedidas e da disponibilidade da API.</p></section>
          <section className="rounded-xl bg-indigo-50 p-4"><h2 className="font-bold text-indigo-950">Como conectar suas contas</h2><p className="mt-2">Entre ou crie uma conta própria do UX Code Social. Em Contas, inicie a conexão e autorize o acesso na página oficial da plataforma. Não informe sua senha do Instagram, Facebook ou Threads no formulário do UX Code Social.</p></section>
        </div>
        <section className="mt-6 border-t border-slate-100 pt-5 text-sm leading-7"><h2 className="font-bold text-slate-950">Identidade e suporte</h2><p>Operado por UX Code Desenvolvimento Web · CNPJ 66.650.579/0001-46 · Curitiba, Paraná, Brasil.</p><p>Contato: <a href="https://uxcode.com.br/#contato" className="font-semibold text-indigo-700 underline underline-offset-2">site da UX Code</a>.</p><p className="mt-3">O UX Code Social não é o Instagram nem um produto da Meta. Não é afiliado, patrocinado ou administrado pela Meta. As marcas das redes identificam apenas os serviços integrados. Você pode desconectar suas contas e solicitar a exclusão dos seus dados.</p></section>
      </article>
      <article id="english" lang="en" className="mt-6 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-9">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">An independent UX Code product</p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">Social account management in one workspace.</h2>
        <p className="mt-4 text-sm leading-7">UX Code Social is operated by UX Code Desenvolvimento Web. It helps users plan posts, view analytics and manage interactions for accounts they are authorized to administer. It is not Instagram and is not affiliated with, sponsored by, or operated by Meta.</p>
        <h3 className="mt-5 font-bold text-slate-950">How sign-in and account connections work</h3>
        <p className="mt-2 text-sm leading-7">Create or sign in to your own UX Code Social account. Its password is not your social network password. In Accounts, start the connection and authorize access on the platform's official website. Never enter your Instagram, Facebook or Threads password in UX Code Social's login form.</p>
        <h3 className="mt-5 font-bold text-slate-950">Features and availability</h3>
        <p className="mt-2 text-sm leading-7">Post scheduling, analytics, comment management and automated replies to supported inbound interactions. Features depend on the platform, permissions and API availability. Users can disconnect their accounts and request data deletion. Social network trademarks identify integrations only.</p>
        <p className="mt-5 text-sm leading-7">Operator: UX Code Desenvolvimento Web · Brazilian company registration (CNPJ) 66.650.579/0001-46 · Curitiba, Paraná, Brazil. Contact: <a href="https://uxcode.com.br/#contato" className="font-semibold text-indigo-700 underline underline-offset-2">UX Code website</a>.</p>
      </article>
      <footer className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-xs font-medium text-indigo-700">
        <Link href="/login">Entrar / Sign in</Link>
        <Link href="/politica-de-privacidade">Privacidade / Privacy</Link>
        <Link href="/termos-de-servico">Termos / Terms</Link>
        <Link href="/exclusao-de-dados">Exclusão de dados / Data deletion</Link>
      </footer>
    </div>
  </div>
}
