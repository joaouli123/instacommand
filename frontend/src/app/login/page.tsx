"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Facebook, Lock, Mail, ArrowRight, ShieldCheck, Instagram } from "lucide-react"
import toast from "react-hot-toast"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("admin@instacommand.com")
  const [password, setPassword] = useState("InstaAdmin2026!")
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setLoading(true)

    try {
      const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001").replace(/\/api\/?$/, "").replace(/\/$/, "")
      const res = await fetch(`${backendUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()
      if (!res.ok || !data.token) {
        throw new Error(data.error || data.message || "Não foi possível entrar na plataforma")
      }

      localStorage.setItem("instacommand_token", data.token)
      if (data.user) localStorage.setItem("instacommand_user", JSON.stringify(data.user))
      toast.success(`Bem-vindo, ${data.user?.name || "Administrador"}!`)
      router.push("/")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar na plataforma")
    } finally {
      setLoading(false)
    }
  }

  const handleFacebookLogin = () => {
    const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001").replace(/\/api\/?$/, "").replace(/\/$/, "")
    window.location.href = `${backendUrl}/api/auth/facebook`
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Soft background glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-200/40 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-200/30 rounded-full blur-[120px] pointer-events-none" />

      <Card className="w-full max-w-md p-8 flex flex-col relative z-10 border border-slate-200/90 bg-white/95 backdrop-blur-md shadow-xl rounded-2xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 flex items-center justify-center text-white shadow-md mb-3">
            <Instagram size={24} strokeWidth={2.4} />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-1">
            InstaCommand
          </h1>
          <p className="text-slate-500 text-xs">
            Painel Profissional de Gestão do Instagram
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 mb-6 text-xs text-emerald-800 font-medium">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>Acesso direto pré-configurado para teste imediato</span>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 mb-5">
          <div>
            <Label className="text-xs font-semibold text-slate-700 mb-1.5 block">E-mail de Acesso</Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-white border-slate-200 text-slate-900 text-sm h-10 rounded-xl"
                placeholder="seu-email@dominio.com"
                required
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700 mb-1.5 block">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-white border-slate-200 text-slate-900 text-sm h-10 rounded-xl"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold h-11 rounded-xl shadow-xs transition-all text-sm"
          >
            {loading ? "Autenticando..." : "Entrar na Plataforma"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>

        <div className="relative flex py-2 items-center mb-5">
          <div className="flex-grow border-t border-slate-200"></div>
          <span className="flex-shrink mx-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">ou acesse com</span>
          <div className="flex-grow border-t border-slate-200"></div>
        </div>

        <Button
          type="button"
          onClick={handleFacebookLogin}
          variant="outline"
          className="w-full bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800 h-11 text-sm font-semibold rounded-xl"
        >
          <Facebook className="mr-2 h-4 w-4 text-[#1877F2]" />
          Conectar com Facebook (Meta API)
        </Button>

        <p className="text-[11px] text-slate-400 text-center mt-6">
          InstaCommand • Multi-contas Instagram Business & Creator
        </p>
      </Card>
    </div>
  )
}
