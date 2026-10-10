"use client"

import { useEffect, useState, type ReactNode } from "react"
import { SiGooglegemini, SiMeta } from "@icons-pack/react-simple-icons"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowRight, Bell, CheckCircle2, Database, Instagram, KeyRound, Languages, Lock, Pencil, Plug, Save, ShieldCheck, Sparkles, X } from "lucide-react"
import toast from "react-hot-toast"
import { fetchApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { LanguageSwitch, useT } from "@/lib/i18n"

type MetaConfigStatus = {
  appId: string
  appIdConfigured: boolean
  appSecretConfigured: boolean
  clientTokenConfigured: boolean
  appSecretPreview?: string | null
  clientTokenPreview?: string | null
}

type AiConfigStatus = {
  apiKeyConfigured: boolean
  apiKeyPreview?: string | null
  model: string
  source: "workspace" | "server" | "openai-compatible" | "none"
}

type UserPreferences = {
  dataRefreshFrequency: "15m" | "1h" | "24h"
  weeklyReport: boolean
  engagementAlerts: boolean
  publishFailureAlerts: boolean
}

const defaultPreferences: UserPreferences = {
  dataRefreshFrequency: "1h",
  weeklyReport: true,
  engagementAlerts: true,
  publishFailureAlerts: true,
}

const NOTIFICATIONS: Array<{ key: keyof Pick<UserPreferences, "weeklyReport" | "engagementAlerts" | "publishFailureAlerts">; title: string; description: string }> = [
  { key: "weeklyReport", title: "Relatório semanal", description: "Um resumo de desempenho toda segunda-feira." },
  { key: "engagementAlerts", title: "Alertas de engajamento", description: "Quando uma publicação superar sua média." },
  { key: "publishFailureAlerts", title: "Falha na publicação", description: "Quando um post agendado não puder ser publicado." },
]

export default function SettingsPage() {
  const t = useT()
  const [metaConfig, setMetaConfig] = useState({ appId: "", appSecret: "", clientToken: "" })
  const [metaStatus, setMetaStatus] = useState<MetaConfigStatus | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [savingMeta, setSavingMeta] = useState(false)
  const [aiConfig, setAiConfig] = useState({ apiKey: "", model: "gemini-2.5-flash" })
  const [aiStatus, setAiStatus] = useState<AiConfigStatus | null>(null)
  const [savingAi, setSavingAi] = useState(false)
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences)
  const [savedPreferences, setSavedPreferences] = useState<UserPreferences>(defaultPreferences)
  const [loadingPreferences, setLoadingPreferences] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  // Bumped after each save so the secret fields go back to their masked state.
  const [savedVersion, setSavedVersion] = useState(0)

  useEffect(() => {
    Promise.all([fetchApi("/settings/meta"), fetchApi("/settings/ai"), fetchApi("/settings/preferences")])
      .then(([metaData, aiData, preferencesData]) => {
        const status = metaData as MetaConfigStatus
        const ai = aiData as AiConfigStatus
        const nextPreferences = preferencesData as UserPreferences
        setMetaStatus(status)
        setMetaConfig((current) => ({ ...current, appId: status.appId || "" }))
        setAiStatus(ai)
        setAiConfig((current) => ({ ...current, model: ai.model || current.model }))
        setPreferences(nextPreferences)
        setSavedPreferences(nextPreferences)
      })
      .catch(() => toast.error(t("Entre na plataforma para ver as configurações")))
      .finally(() => { setLoadingMeta(false); setLoadingPreferences(false) })
  }, [])

  const saveMetaConfig = async () => {
    if (!metaConfig.appId.trim()) {
      toast.error(t("Informe o App ID da Meta"))
      return
    }
    if (!metaConfig.appSecret.trim() && !metaStatus?.appSecretConfigured) {
      toast.error(t("Informe o App Secret da Meta"))
      return
    }
    setSavingMeta(true)
    try {
      const status = await fetchApi("/settings/meta", { method: "PUT", body: JSON.stringify(metaConfig) }) as MetaConfigStatus
      setMetaStatus(status)
      setMetaConfig((current) => ({ ...current, appId: status.appId, appSecret: "", clientToken: "" }))
      setSavedVersion((value) => value + 1)
      toast.success(t("Credenciais da Meta salvas com segurança"))
    } catch {
      toast.error(t("Não foi possível salvar as credenciais da Meta"))
    } finally {
      setSavingMeta(false)
    }
  }

  const saveAiConfig = async () => {
    if (!aiConfig.apiKey.trim() && !aiStatus?.apiKeyConfigured) {
      toast.error(t("Cole a chave da API do Gemini"))
      return
    }
    setSavingAi(true)
    try {
      const status = await fetchApi("/settings/ai", { method: "PUT", body: JSON.stringify(aiConfig) }) as AiConfigStatus
      setAiStatus(status)
      setAiConfig((current) => ({ ...current, apiKey: "", model: status.model }))
      setSavedVersion((value) => value + 1)
      toast.success(t("Gemini conectado com segurança"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Não foi possível salvar a conexão com o Gemini"))
    } finally {
      setSavingAi(false)
    }
  }

  const saveSettings = async () => {
    setSavingSettings(true)
    try {
      const saved = await fetchApi("/settings/preferences", { method: "PUT", body: JSON.stringify(preferences) }) as UserPreferences
      setPreferences(saved)
      setSavedPreferences(saved)
      toast.success(t("Preferências salvas"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Não foi possível salvar as preferências"))
    } finally {
      setSavingSettings(false)
    }
  }

  const discardSettings = () => {
    setPreferences(savedPreferences)
    toast.success(t("Alterações descartadas"))
  }
  const metaReady = Boolean(metaStatus?.appIdConfigured && metaStatus?.appSecretConfigured)
  // Platform-provided Meta credentials are never shown; workspaces only see and edit their own.
  const metaManagedByPlatform = metaReady && !metaStatus?.appSecretPreview
  const preferencesChanged = JSON.stringify(preferences) !== JSON.stringify(savedPreferences)
  const aiReady = Boolean(aiStatus?.apiKeyConfigured)

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div><p className="page-eyebrow">Workspace</p><h1 className="page-title">{t("Configurações")}</h1><p className="page-subtitle">{t("Conexões, inteligência artificial e como o InstaCommand avisa você.")}</p></div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Languages size={19} /></span><div><h3 className="section-title">{t("Idioma da interface")}</h3><p className="mt-0.5 text-xs leading-5 text-slate-500">{t("Escolha o idioma dos menus, botões e mensagens. Fica salvo neste navegador.")}</p></div></div>
        <LanguageSwitch />
      </Card>

      <Tabs defaultValue="connections" className="space-y-5">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">
            <TabsTrigger value="connections" className="gap-1.5"><Plug size={15} />{t("Conexões")}<StatusDot ok={metaReady} /></TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5"><Sparkles size={15} />{t("Inteligência artificial")}<StatusDot ok={aiReady} /></TabsTrigger>
            <TabsTrigger value="preferences" className="gap-1.5"><Bell size={15} />{t("Dados e avisos")}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="connections" className="space-y-5">
          <SettingsCard icon={<SiMeta size={20} color="white" />} tile="bg-[#0866FF]" title={t("Conexão com a Meta")} description={t("Necessária para conectar Instagram e Facebook.")} badge={metaReady ? t("Pronto para conectar") : undefined}>
            {metaManagedByPlatform ? <ConnectBanner /> : <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="meta-app-id">App ID</Label>
                  <Input id="meta-app-id" value={metaConfig.appId} onChange={(event) => setMetaConfig((current) => ({ ...current, appId: event.target.value }))} placeholder={t("Ex.: 893065073808569")} disabled={loadingMeta} />
                  <p className="text-[11px] text-slate-500">{t("O número do seu aplicativo no Meta for Developers.")}</p>
                </div>
                <SecretField key={`secret-${savedVersion}`} id="meta-app-secret" label="App Secret" preview={metaStatus?.appSecretPreview} configured={metaStatus?.appSecretConfigured} value={metaConfig.appSecret} onChange={(value) => setMetaConfig((current) => ({ ...current, appSecret: value }))} placeholder={t("Cole o App Secret")} disabled={loadingMeta} />
              </div>
              <SecretField key={`token-${savedVersion}`} id="meta-client-token" label="Client Token" optional preview={metaStatus?.clientTokenPreview} configured={metaStatus?.clientTokenConfigured} value={metaConfig.clientToken} onChange={(value) => setMetaConfig((current) => ({ ...current, clientToken: value }))} placeholder={t("Cole o Client Token, se o seu app exigir")} disabled={loadingMeta} />
              <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">{t("Os segredos ficam criptografados no servidor.")}</p>
                <Button onClick={saveMetaConfig} disabled={savingMeta || loadingMeta} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Save size={15} />{savingMeta ? t("Salvando...") : t("Salvar")}</Button>
              </div>
              {metaReady && <ConnectBanner />}
            </div>}
          </SettingsCard>
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-600" size={18} /><p className="text-xs leading-5 text-emerald-900">{t("Suas conexões ficam guardadas com segurança e podem ser removidas a qualquer momento em")} <a href="/accounts" className="font-semibold underline">{t("Contas")}</a>. {t("Para IAs como ChatGPT e Claude, veja")} <a href="/integrations" className="font-semibold underline">{t("MCP e CLI")}</a>.</p></div>
        </TabsContent>

        <TabsContent value="ai">
          <SettingsCard icon={<SiGooglegemini size={20} color="white" />} tile="bg-gradient-to-br from-[#4F7BF7] to-[#9B72CB]" title={t("Assistente com Gemini")} description={t("Gera legendas, planos, auditorias e respostas com os dados reais das suas contas.")} badge={aiReady ? (aiStatus?.source === "workspace" ? t("Sua chave") : t("Ativo")) : undefined}>
            <div className="space-y-4">
              {aiReady && aiStatus?.source !== "workspace" && <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{t("O assistente já está ativo pela chave da plataforma. Se preferir, cole a sua própria chave abaixo.")}</p>}
              <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                <SecretField key={`ai-${savedVersion}`} id="gemini-api-key" label={t("Chave da API do Gemini")} preview={aiStatus?.apiKeyPreview} configured={aiStatus?.source === "workspace"} value={aiConfig.apiKey} onChange={(value) => setAiConfig((current) => ({ ...current, apiKey: value }))} placeholder={t("Cole sua chave do Gemini")} />
                <div className="space-y-1.5">
                  <Label htmlFor="gemini-model">{t("Modelo")}</Label>
                  <Input id="gemini-model" value={aiConfig.model} onChange={(event) => setAiConfig((current) => ({ ...current, model: event.target.value }))} placeholder="gemini-2.5-flash" />
                  <p className="text-[11px] text-slate-500">{t("Modelo disponível na sua conta Google AI.")}</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">{aiReady ? t("Pronto para usar em Publicação, Contas e Comunidade.") : t("Salve uma chave para ativar o assistente.")}</p>
                <Button onClick={saveAiConfig} disabled={savingAi} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Save size={15} />{savingAi ? t("Salvando...") : t("Salvar")}</Button>
              </div>
            </div>
          </SettingsCard>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-5">
          <SettingsCard icon={<Database size={19} />} tile="bg-indigo-50 text-indigo-600" title={t("Coleta de dados")} description={t("Com que frequência as métricas de cada conta são atualizadas.")}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Label className="text-sm font-semibold text-slate-900">{t("Atualizar métricas")}</Label>
              <div className="w-full sm:w-52"><Select value={preferences.dataRefreshFrequency} onValueChange={(value) => setPreferences((current) => ({ ...current, dataRefreshFrequency: value as UserPreferences["dataRefreshFrequency"] }))} disabled={loadingPreferences || savingSettings}><SelectTrigger aria-label={t("Frequência de atualização")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="15m">{t("A cada 15 min")}</SelectItem><SelectItem value="1h">{t("A cada 1 hora")}</SelectItem><SelectItem value="24h">{t("Uma vez por dia")}</SelectItem></SelectContent></Select></div>
            </div>
          </SettingsCard>
          <SettingsCard icon={<Bell size={19} />} tile="bg-sky-50 text-sky-600" title={t("Notificações")} description={t("Escolha o que merece sua atenção.")}>
            <div className="-my-2 divide-y divide-slate-100">{NOTIFICATIONS.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-6 py-3.5">
                <div><Label htmlFor={`pref-${item.key}`} className="text-sm font-semibold text-slate-900">{t(item.title)}</Label><p className="mt-0.5 text-xs text-slate-500">{t(item.description)}</p></div>
                <Switch id={`pref-${item.key}`} checked={preferences[item.key]} onCheckedChange={(checked) => setPreferences((current) => ({ ...current, [item.key]: checked }))} disabled={loadingPreferences || savingSettings} aria-label={t(item.title)} />
              </div>
            ))}</div>
          </SettingsCard>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            {preferencesChanged && <span className="text-xs font-medium text-amber-700 sm:mr-auto">{t("Você tem alterações não salvas.")}</span>}
            <Button variant="outline" onClick={discardSettings} disabled={!preferencesChanged || savingSettings || loadingPreferences}>{t("Descartar")}</Button>
            <Button onClick={saveSettings} disabled={!preferencesChanged || savingSettings || loadingPreferences} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Save size={16} />{savingSettings ? t("Salvando...") : t("Salvar preferências")}</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StatusDot({ ok }: { ok: boolean }) {
  const t = useT()
  return <span className={cn("ml-0.5 h-2 w-2 rounded-full", ok ? "bg-emerald-500" : "bg-amber-400")} aria-label={ok ? t("configurado") : t("pendente")} />
}

function SettingsCard({ icon, tile, title, description, badge, children }: { icon: ReactNode; tile: string; title: string; description: string; badge?: string; children: ReactNode }) {
  return <Card className="overflow-hidden p-0">
    <div className="flex items-start gap-3 border-b border-slate-100 p-4 sm:p-5">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white", tile)}>{icon}</span>
      <div className="min-w-0 flex-1"><h3 className="section-title">{title}</h3><p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p></div>
      {badge && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 size={13} />{badge}</span>}
    </div>
    <div className="p-4 sm:p-5">{children}</div>
  </Card>
}

function ConnectBanner() {
  const t = useT()
  return <div className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
    <div><p className="text-sm font-semibold text-emerald-900">{t("Tudo pronto para conectar")}</p><p className="mt-1 text-xs leading-5 text-emerald-800">{t("Clique ao lado, autorize a Meta e escolha suas contas profissionais.")}</p></div>
    <Button onClick={() => window.location.assign("/accounts")} className="shrink-0 gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Instagram size={15} />{t("Conectar contas")}<ArrowRight size={15} /></Button>
  </div>
}

/**
 * A saved secret shows its first characters followed by asterisks, so you can
 * see that something is stored. "Trocar" opens an empty field for a new value.
 */
function SecretField({ id, label, optional, preview, configured, value, onChange, placeholder, disabled }: { id: string; label: string; optional?: boolean; preview?: string | null; configured?: boolean; value: string; onChange: (value: string) => void; placeholder: string; disabled?: boolean }) {
  const t = useT()
  const saved = Boolean(configured)
  const [editing, setEditing] = useState(false)
  const masked = saved && !editing
  return <div className="space-y-1.5">
    <Label htmlFor={id}>{label}{optional && <span className="font-normal text-slate-400"> {t("(opcional)")}</span>}</Label>
    {masked ? <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Lock className="absolute left-3 top-3 h-4 w-4 text-emerald-600" />
        <Input id={id} readOnly value={preview || "************"} className="bg-slate-50 pl-9 font-mono tracking-wider text-slate-700" aria-describedby={`${id}-hint`} />
      </div>
      <Button type="button" variant="outline" onClick={() => setEditing(true)} disabled={disabled} className="shrink-0 gap-1.5"><Pencil size={14} />{t("Trocar")}</Button>
    </div> : <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <Input id={id} type="password" className="pl-9" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} autoComplete="new-password" autoFocus={editing} aria-describedby={`${id}-hint`} />
      </div>
      {saved && <Button type="button" variant="ghost" size="icon" aria-label={t("Manter o valor salvo")} onClick={() => { onChange(""); setEditing(false) }}><X size={16} /></Button>}
    </div>}
    <p id={`${id}-hint`} className={cn("text-[11px]", masked ? "text-emerald-700" : "text-slate-500")}>{masked ? t("Salvo e criptografado. Por segurança, só o início aparece.") : saved ? t("Cole o novo valor e salve. Para manter o atual, clique no X.") : t("Fica criptografado e nunca é exibido por inteiro.")}</p>
  </div>
}
