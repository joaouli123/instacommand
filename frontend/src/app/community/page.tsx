"use client"

import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MessageCircle, RefreshCw, Send, Sparkles, Trash2, ExternalLink, Users } from "lucide-react"
import toast from "react-hot-toast"
import { api } from "@/lib/api"
import { useActiveAccount } from "@/hooks/useActiveAccount"

type CommentItem = {
  id: string
  text: string
  username?: string
  timestamp?: string
  like_count?: number
  mediaId: string
  mediaCaption?: string | null
  mediaUrl?: string | null
  permalink?: string | null
}

export default function CommunityPage() {
  const { accountId, activeAccount, isLoading: accountLoading } = useActiveAccount()
  if (accountLoading) return <Card className="p-10 text-center">Carregando contas...</Card>
  if (!activeAccount) return <Card className="mx-auto max-w-xl p-10 text-center"><Users className="mx-auto mb-3 text-indigo-600" size={28}/><h2 className="text-xl font-bold text-slate-900">Conecte uma conta para abrir a comunidade</h2><p className="mt-2 text-sm text-slate-500">Os comentários são carregados diretamente da conta profissional selecionada.</p></Card>
  return <AccountCommunity key={accountId} accountId={accountId} username={activeAccount.igUsername} />
}

function AccountCommunity({ accountId, username }: { accountId: string; username: string }) {
  const mounted = useRef(false)
  const requestSequence = useRef(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestSequence.current++ } }, [])
  const [comments, setComments] = useState<CommentItem[]>([])
  const [available, setAvailable] = useState(true)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null)

  const loadComments = async () => {
    if (!accountId || !mounted.current) return
    const requestId = ++requestSequence.current
    setLoading(true)
    try {
      const result = await api.getComments(accountId) as { available?: boolean; comments?: CommentItem[]; message?: string }
      if (!mounted.current || requestId !== requestSequence.current) return
      setAvailable(result.available !== false)
      setComments(result.comments || [])
      setMessage(result.message || "")
    } catch (error) {
      if (!mounted.current || requestId !== requestSequence.current) return
      setAvailable(false)
      setComments([])
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar os comentários.")
    } finally {
      if (mounted.current && requestId === requestSequence.current) setLoading(false)
    }
  }

  useEffect(() => { void loadComments() }, [accountId])

  const generateReply = async (comment: CommentItem) => {
    setAiLoadingId(comment.id)
    try {
      const result = await api.generateAi({ mode: "reply", accountId, comment: comment.text }) as { result?: { response?: string } }
      if (!mounted.current) return
      const response = result.result?.response || ""
      if (response) setDrafts((current) => ({ ...current, [comment.id]: response }))
      toast.success("Resposta sugerida pela IA.")
    } catch (error) {
      if (mounted.current) toast.error(error instanceof Error ? error.message : "Não foi possível gerar a resposta.")
    } finally {
      if (mounted.current) setAiLoadingId(null)
    }
  }

  const reply = async (comment: CommentItem) => {
    const text = (drafts[comment.id] || "").trim()
    if (!text) return toast.error("Escreva ou gere uma resposta antes de enviar.")
    setReplyingId(comment.id)
    try {
      await api.replyComment({ accountId, mediaId: comment.mediaId, commentId: comment.id, message: text })
      if (!mounted.current) return
      setDrafts((current) => ({ ...current, [comment.id]: "" }))
      toast.success("Resposta publicada no Instagram.")
      await loadComments()
    } catch (error) {
      if (mounted.current) toast.error(error instanceof Error ? error.message : "Não foi possível responder este comentário.")
    } finally {
      if (mounted.current) setReplyingId(null)
    }
  }

  const remove = async (comment: CommentItem) => {
    if (!window.confirm("Excluir este comentário no Instagram?")) return
    try {
      await api.deleteComment({ accountId, mediaId: comment.mediaId, commentId: comment.id })
      if (!mounted.current) return
      setComments((current) => current.filter((item) => item.id !== comment.id))
      toast.success("Comentário excluído.")
    } catch (error) {
      if (mounted.current) toast.error(error instanceof Error ? error.message : "Não foi possível excluir o comentário.")
    }
  }


  return <div className="space-y-6 animate-fade-in">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Relacionamento</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Comunidade</h2><p className="mt-1 text-sm text-slate-500">Comentários reais de @{username}, com resposta assistida por IA.</p></div><Button variant="outline" onClick={() => void loadComments()} disabled={loading} className="gap-2"><RefreshCw size={15} className={loading ? "animate-spin" : ""}/>Atualizar</Button></div>
    {!available && <Card className="border-amber-200 bg-amber-50/80 p-5"><div className="flex gap-3"><MessageCircle className="mt-0.5 shrink-0 text-amber-600"/><div><h3 className="font-bold text-amber-900">Não foi possível carregar os comentários</h3><p className="mt-1 text-sm leading-6 text-amber-800">{message || "Tente atualizar novamente. Se o erro persistir, confira a conexão e as permissões da conta."}</p></div></div></Card>}
    {available && !comments.length && !loading && <Card className="p-12 text-center"><MessageCircle className="mx-auto mb-3 text-slate-300" size={34}/><h3 className="font-bold text-slate-900">Nenhum comentário disponível</h3><p className="mt-1 text-sm text-slate-500">A Meta não retornou comentários nas publicações recentes desta conta.</p></Card>}
    <div className="space-y-4">{comments.map((comment) => <Card key={comment.id} className="p-5"><div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 text-sm font-bold text-white">{(comment.username || "?")[0].toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900">@{comment.username || "usuário"}</p><Badge variant="secondary">{comment.like_count || 0} curtidas</Badge>{comment.timestamp && <span className="text-xs text-slate-400">{new Date(comment.timestamp).toLocaleString("pt-BR")}</span>}</div><p className="mt-2 text-sm leading-6 text-slate-700">{comment.text}</p>{comment.permalink && <a href={comment.permalink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600">Abrir publicação <ExternalLink size={12}/></a>}<div className="mt-4 space-y-2"><textarea value={drafts[comment.id] || ""} onChange={(event) => setDrafts((current) => ({ ...current, [comment.id]: event.target.value }))} maxLength={1000} placeholder="Escreva uma resposta..." className="min-h-20 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"/><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => void generateReply(comment)} disabled={aiLoadingId === comment.id} className="gap-2 text-indigo-700"><Sparkles size={14}/>{aiLoadingId === comment.id ? "Gerando..." : "Sugerir com IA"}</Button><Button type="button" onClick={() => void reply(comment)} disabled={replyingId === comment.id} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Send size={14}/>{replyingId === comment.id ? "Enviando..." : "Responder"}</Button><Button type="button" variant="ghost" onClick={() => void remove(comment)} className="gap-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={14}/>Excluir</Button></div></div></div></div></Card>)}</div>
  </div>
}
