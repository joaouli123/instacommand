"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Bell, Database, ShieldCheck, Save } from "lucide-react"
import toast from "react-hot-toast"

export default function SettingsPage() {
  const saveSettings = () => toast.success("Configurações salvas com sucesso")

  return (
    <div className="max-w-4xl space-y-6 animate-fade-in pb-10">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Workspace</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Configurações</h2><p className="mt-1 text-sm text-slate-500">Ajuste a coleta de dados, notificações e segurança da operação.</p></div>

      <div className="grid gap-5">
        <Card className="overflow-hidden p-0"><div className="flex items-start gap-3 border-b border-slate-100 p-6"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Database size={19} /></div><div><h3 className="font-bold text-slate-900">Coleta de dados</h3><p className="mt-1 text-xs text-slate-500">Defina com que frequência as métricas serão atualizadas.</p></div></div><div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><Label className="text-sm font-semibold text-slate-900">Frequência de atualização</Label><p className="mt-1 text-sm text-slate-500">Buscas mais frequentes deixam os painéis sempre atualizados.</p></div><div className="w-full sm:w-52"><Select defaultValue="1h"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="15m">A cada 15 min</SelectItem><SelectItem value="1h">A cada 1 hora</SelectItem><SelectItem value="24h">Apenas diariamente</SelectItem></SelectContent></Select></div></div></Card>

        <Card className="overflow-hidden p-0"><div className="flex items-start gap-3 border-b border-slate-100 p-6"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><Bell size={19} /></div><div><h3 className="font-bold text-slate-900">Notificações</h3><p className="mt-1 text-xs text-slate-500">Escolha quais eventos merecem sua atenção.</p></div></div><div className="divide-y divide-slate-100 px-6">{[{ title: "Relatório semanal", description: "Receba um resumo de performance toda segunda-feira." }, { title: "Alertas de engajamento", description: "Seja notificado quando uma publicação superar sua média." }, { title: "Falha na publicação", description: "Receba alertas caso um post agendado não seja publicado." }].map((item) => (<div key={item.title} className="flex items-center justify-between gap-6 py-5"><div><Label className="text-sm font-semibold text-slate-900">{item.title}</Label><p className="mt-1 text-sm text-slate-500">{item.description}</p></div><Switch defaultChecked aria-label={item.title} /></div>))}</div></Card>

        <Card className="flex items-start gap-3 border-emerald-100 bg-emerald-50/50 p-5"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-600" size={19} /><div><p className="text-sm font-semibold text-emerald-900">Conta protegida</p><p className="mt-1 text-xs leading-relaxed text-emerald-800">Suas conexões são armazenadas com segurança e podem ser revogadas a qualquer momento em Contas.</p></div></Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="outline">Descartar alterações</Button><Button onClick={saveSettings} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Save size={16} />Salvar configurações</Button></div>
      </div>
    </div>
  )
}
