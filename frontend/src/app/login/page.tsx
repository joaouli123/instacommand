"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Lock, Mail, ArrowRight, ShieldCheck, Instagram, UserRound } from "lucide-react"
import toast from "react-hot-toast"
import { BACKEND_ORIGIN } from "@/lib/config"

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<"login" | "register">("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)

    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login"
      const body = mode === "register" ? { name, email, password } : { email, password }
      const res = await fetch(`${BACKEND_ORIGIN}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.token) {
        throw new Error(data.error || data.message || "Não foi possível entrar na plataforma")
      }

      localStorage.setItem("instacommand_token", data.token)
      if (data.user) localStorage.setItem("instacommand_user", JSON.stringify(data.user))
      toast.success(mode === "register" ? "Workspace criado com sucesso!" : `Bem-vindo, ${data.user?.name || "de volta"}!`)

      const next = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next") || "/"
        : "/"
      router.push(next.startsWith("/") ? next : "/")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível concluir o acesso")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-50 p-4">
      <div className="pointer-events-none absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-indigo-200/40 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-pink-200/30 blur-[120px]" />

      <Card className="relative z-10 flex w-full max-w-md flex-col rounded-2xl border border-slate-200/90 bg-white/95 p-8 shadow-xl backdrop-blur-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 text-white shadow-md">
            <Instagram size={24} strokeWidth={2.4} />
          </div>
          <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-slate-900">InstaCommand</h1>
          <p className="text-xs text-slate-500">Seu workspace para gerenciar todas as redes</p>
        </div>

        <div className="mb-6 flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          <button type="button" onClick={() => setMode("login")} className={`flex-1 rounded-lg px-3 py-2 transition ${mode === "login" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}>
            Entrar
          </button>
          <button type="button" onClick={() => setMode("register")} className={`flex-1 rounded-lg px-3 py-2 transition ${mode === "register" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}>
            Criar conta
          </button>
        </div>

        <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>Suas contas sociais ficam isoladas no seu workspace.</span>
        </div>

        <form onSubmit={handleSubmit} className="mb-5 space-y-4">
          {mode === "register" && (
            <div>
              <Label className="mb-1.5 block text-xs font-semibold text-slate-700">Nome</Label>
              <div className="relative">
                <UserRound className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <Input type="text" value={name} onChange={(event) => setName(event.target.value)} className="h-10 rounded-xl border-slate-200 bg-white pl-10 text-sm text-slate-900" placeholder="Seu nome" required />
              </div>
            </div>
          )}

          <div>
            <Label className="mb-1.5 block text-xs font-semibold text-slate-700">E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 rounded-xl border-slate-200 bg-white pl-10 text-sm text-slate-900" placeholder="voce@empresa.com" required />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs font-semibold text-slate-700">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-10 rounded-xl border-slate-200 bg-white pl-10 text-sm text-slate-900" placeholder="Mínimo de 8 caracteres" minLength={8} required />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-xs transition-all hover:bg-indigo-700">
            {loading ? "Aguarde..." : mode === "register" ? "Criar meu workspace" : "Entrar na plataforma"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-3 text-center text-xs leading-5 text-indigo-800">
          Entre primeiro no seu workspace. Depois, em <strong>Contas</strong>, clique em <strong>Adicionar conta</strong> para conectar Instagram, Facebook e Threads com a autorização oficial da Meta.
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-400">Cada cliente conecta e administra somente as próprias contas.</p>
      </Card>
    </div>
  )
}
