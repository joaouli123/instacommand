"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Bell, Database, ShieldCheck, Save, Instagram, KeyRound, CheckCircle2, AtSign, ArrowRight } from "lucide-react"
import toast from "react-hot-toast"
import { fetchApi } from "@/lib/api"

type MetaConfigStatus = {
  appId: string
  appIdConfigured: boolean
  appSecretConfigured: boolean
  clientTokenConfigured: boolean
}

type ThreadsConfigStatus = {
  appId: string
  appIdConfigured: boolean
  appSecretConfigured: boolean
}

export default function SettingsPage() {
  const [metaConfig, setMetaConfig] = useState({ appId: "", appSecret: "", clientToken: "" })
  const [metaStatus, setMetaStatus] = useState<MetaConfigStatus | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [savingMeta, setSavingMeta] = useState(false)
  const [threadsConfig, setThreadsConfig] = useState({ appId: "", appSecret: "" })
  const [threadsStatus, setThreadsStatus] = useState<ThreadsConfigStatus | null>(null)
  const [savingThreads, setSavingThreads] = useState(false)

  useEffect(() => {
    Promise.all([fetchApi("/settings/meta"), fetchApi("/settings/threads")])
      .then(([metaData, threadsData]) => {
        const status = metaData as MetaConfigStatus
        const threads = threadsData as ThreadsConfigStatus
        setMetaStatus(status)
        setMetaConfig((current) => ({ ...current, appId: status.appId || "" }))
        setThreadsStatus(threads)
        setThreadsConfig((current) => ({ ...current, appId: threads.appId || "" }))
      })
      .catch(() => toast.error("Entre na plataforma para configurar a Meta"))
      .finally(() => setLoadingMeta(false))
  }, [])

  const saveMetaConfig = async () => {
    if (!metaConfig.appId.trim()) {
      toast.error("Informe o App ID da Meta")
      return
    }

    if (!metaConfig.appSecret.trim() && !metaStatus?.appSecretConfigured) {
      toast.error("Informe o App Secret da Meta")
      return
    }

    setSavingMeta(true)
    try {
      const status = await fetchApi("/settings/meta", {
        method: "PUT",
        body: JSON.stringify(metaConfig),
      }) as MetaConfigStatus
      setMetaStatus(status)
      setMetaConfig((current) => ({ ...current, appId: status.appId, appSecret: "", clientToken: "" }))
      toast.success("Credenciais da Meta salvas com segurança")
    } catch {
      toast.error("Não foi possível salvar as credenciais da Meta")
    } finally {
      setSavingMeta(false)
    }
  }

  const saveThreadsConfig = async () => {
    if (!threadsConfig.appId.trim()) {
      toast.error("Informe o App ID do Threads")
      return
    }

    if (!threadsConfig.appSecret.trim() && !threadsStatus?.appSecretConfigured) {
      toast.error("Informe o App Secret do Threads")
      return
    }

    setSavingThreads(true)
    try {
      const status = await fetchApi("/settings/threads", {
        method: "PUT",
        body: JSON.stringify(threadsConfig),
      }) as ThreadsConfigStatus
      setThreadsStatus(status)
      setThreadsConfig((current) => ({ ...current, appId: status.appId, appSecret: "" }))
      toast.success("Credenciais do Threads salvas com segurança")
    } catch {
      toast.error("Não foi possível salvar as credenciais do Threads")
    } finally {
      setSavingThreads(false)
    }
  }

  const saveSettings = () => toast.success("Configurações salvas com sucesso")
  const metaReady = Boolean(metaStatus?.appIdConfigured && metaStatus?.appSecretConfigured)
  const threadsReady = Boolean(threadsStatus?.appIdConfigured && threadsStatus?.appSecretConfigured)
  const openAccounts = () => { window.location.assign("/accounts") }

  return (
    <div className="max-w-4xl space-y-6 animate-fade-in pb-10">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Workspace</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Configurações</h2><p className="mt-1 text-sm text-slate-500">Ajuste a coleta de dados, notificações e segurança da operação.</p></div>

      <div className="grid gap-5">
        <Card className="overflow-hidden p-0">
          <div className="flex items-start gap-3 border-b border-slate-100 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-600"><Instagram size={19} /></div>
            <div>
              <h3 className="font-bold text-slate-900">Conexão com a Meta</h3>
              <p className="mt-1 text-xs text-slate-500">Conecte suas contas pelo botão da Meta. A configuração técnica fica protegida no servidor.</p>
            </div>
            {metaReady && <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 size={13} />Pronto para conectar</span>}
          </div>

          <div className="space-y-4 p-6">
            {metaReady ? <div className="flex flex-col gap-4 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-emerald-900">Login automático ativado</p><p className="mt-1 text-xs leading-relaxed text-emerald-800">Você não precisa copiar token nem criar outro aplicativo. Clique abaixo, autorize a Meta e escolha as contas profissionais.</p></div><Button onClick={openAccounts} className="shrink-0 gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Instagram size={15} />Conectar contas <ArrowRight size={15} /></Button></div> : <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="meta-app-id">App ID</Label>
                <Input id="meta-app-id" value={metaConfig.appId} onChange={(event) => setMetaConfig((current) => ({ ...current, appId: event.target.value }))} placeholder="Ex.: 893065073808569" disabled={loadingMeta} />
                <p className="text-[11px] text-slate-500">O identificador numérico do seu aplicativo no Meta for Developers.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meta-app-secret">App Secret</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input id="meta-app-secret" type="password" className="pl-9" value={metaConfig.appSecret} onChange={(event) => setMetaConfig((current) => ({ ...current, appSecret: event.target.value }))} placeholder={metaStatus?.appSecretConfigured ? "Segredo salvo — preencha só para trocar" : "Cole o App Secret"} disabled={loadingMeta} autoComplete="new-password" />
                </div>
                <p className="text-[11px] text-slate-500">Fica criptografado no backend e nunca é exibido novamente.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meta-client-token">Client Token <span className="font-normal text-slate-400">(opcional)</span></Label>
              <Input id="meta-client-token" type="password" value={metaConfig.clientToken} onChange={(event) => setMetaConfig((current) => ({ ...current, clientToken: event.target.value }))} placeholder={metaStatus?.clientTokenConfigured ? "Token salvo — preencha só para trocar" : "Cole o Client Token, se o seu app exigir"} disabled={loadingMeta} autoComplete="new-password" />
              <p className="text-[11px] text-slate-500">Útil para configurações avançadas da Meta; o OAuth usa principalmente App ID e App Secret.</p>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3.5 text-xs text-indigo-900 sm:flex-row sm:items-center sm:justify-between">
              <span>Depois de salvar, use “Entrar com a Meta” em Contas conectadas.</span>
              <Button onClick={saveMetaConfig} disabled={savingMeta || loadingMeta} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Save size={15} />{savingMeta ? "Salvando..." : "Salvar Meta"}</Button>
            </div>
            </>}
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex items-start gap-3 border-b border-slate-100 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><AtSign size={19} /></div>
            <div>
              <h3 className="font-bold text-slate-900">Conexão com o Threads</h3>
              <p className="mt-1 text-xs text-slate-500">Conecte o Threads pelo botão de autorização, sem colar tokens.</p>
            </div>
            {threadsReady && <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 size={13} />Pronto para conectar</span>}
          </div>

          <div className="space-y-4 p-6">
            {threadsReady ? <div className="flex flex-col gap-4 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-emerald-900">Login automático ativado</p><p className="mt-1 text-xs leading-relaxed text-emerald-800">Na tela Contas conectadas, escolha “Conectar Threads” e autorize o perfil desejado.</p></div><Button onClick={openAccounts} className="shrink-0 gap-2 bg-slate-900 text-white hover:bg-slate-800"><AtSign size={15} />Conectar Threads <ArrowRight size={15} /></Button></div> : <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="threads-app-id">App ID do Threads</Label>
                <Input id="threads-app-id" value={threadsConfig.appId} onChange={(event) => setThreadsConfig((current) => ({ ...current, appId: event.target.value }))} placeholder="Ex.: 1051962054293446" disabled={loadingMeta} />
                <p className="text-[11px] text-slate-500">É diferente do App ID principal do Meta.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="threads-app-secret">App Secret do Threads</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input id="threads-app-secret" type="password" className="pl-9" value={threadsConfig.appSecret} onChange={(event) => setThreadsConfig((current) => ({ ...current, appSecret: event.target.value }))} placeholder={threadsStatus?.appSecretConfigured ? "Segredo salvo — preencha só para trocar" : "Cole o App Secret do Threads"} disabled={loadingMeta} autoComplete="new-password" />
                </div>
                <p className="text-[11px] text-slate-500">Fica criptografado e nunca é exibido novamente.</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 sm:flex-row sm:items-center sm:justify-between">
              <span>Depois de salvar, use “Entrar com Threads” em Contas conectadas.</span>
              <Button onClick={saveThreadsConfig} disabled={savingThreads || loadingMeta} className="gap-2 bg-slate-900 text-white hover:bg-slate-800"><Save size={15} />{savingThreads ? "Salvando..." : "Salvar Threads"}</Button>
            </div>
            </>}
          </div>
        </Card>

        <Card className="overflow-hidden p-0"><div className="flex items-start gap-3 border-b border-slate-100 p-6"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Database size={19} /></div><div><h3 className="font-bold text-slate-900">Coleta de dados</h3><p className="mt-1 text-xs text-slate-500">Defina com que frequência as métricas serão atualizadas.</p></div></div><div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><Label className="text-sm font-semibold text-slate-900">Frequência de atualização</Label><p className="mt-1 text-sm text-slate-500">Buscas mais frequentes deixam os painéis sempre atualizados.</p></div><div className="w-full sm:w-52"><Select defaultValue="1h"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="15m">A cada 15 min</SelectItem><SelectItem value="1h">A cada 1 hora</SelectItem><SelectItem value="24h">Apenas diariamente</SelectItem></SelectContent></Select></div></div></Card>

        <Card className="overflow-hidden p-0"><div className="flex items-start gap-3 border-b border-slate-100 p-6"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><Bell size={19} /></div><div><h3 className="font-bold text-slate-900">Notificações</h3><p className="mt-1 text-xs text-slate-500">Escolha quais eventos merecem sua atenção.</p></div></div><div className="divide-y divide-slate-100 px-6">{[{ title: "Relatório semanal", description: "Receba um resumo de performance toda segunda-feira." }, { title: "Alertas de engajamento", description: "Seja notificado quando uma publicação superar sua média." }, { title: "Falha na publicação", description: "Receba alertas caso um post agendado não seja publicado." }].map((item) => (<div key={item.title} className="flex items-center justify-between gap-6 py-5"><div><Label className="text-sm font-semibold text-slate-900">{item.title}</Label><p className="mt-1 text-sm text-slate-500">{item.description}</p></div><Switch defaultChecked aria-label={item.title} /></div>))}</div></Card>

        <Card className="flex items-start gap-3 border-emerald-100 bg-emerald-50/50 p-5"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-600" size={19} /><div><p className="text-sm font-semibold text-emerald-900">Conta protegida</p><p className="mt-1 text-xs leading-relaxed text-emerald-800">Suas conexões são armazenadas com segurança e podem ser revogadas a qualquer momento em Contas.</p></div></Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="outline">Descartar alterações</Button><Button onClick={saveSettings} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Save size={16} />Salvar configurações</Button></div>
      </div>
    </div>
  )
}
