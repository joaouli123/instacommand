"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, MapPin, MessageSquare, RotateCcw, Send } from "lucide-react"
import toast from "react-hot-toast"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

export type ClientComment = {
  id: string
  postId: string
  parentId: string | null
  authorName: string
  body: string
  fromOwner: boolean
  mediaIndex: number | null
  x: number | null
  y: number | null
  resolved: boolean
  createdAt: string
  link?: { id: string; name: string }
}

export const formatCommentTime = (value: string) => new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })

/** Client observations left through share links, shown in the calendar post panel. */
export function ClientCommentsPanel({ postId }: { postId: string }) {
  const queryClient = useQueryClient()
  const key = ["client-comments", postId]
  const query = useQuery({ queryKey: key, queryFn: () => api.getPostClientComments(postId) })
  const comments = (query.data || []) as ClientComment[]
  const roots = comments.filter((comment) => !comment.parentId)
  const [showResolved, setShowResolved] = useState(false)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [reply, setReply] = useState("")
  const refresh = () => queryClient.invalidateQueries({ queryKey: key })

  const resolveMutation = useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) => api.resolveClientComment(id, resolved),
    onSuccess: refresh,
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível atualizar."),
  })
  const replyMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => api.replyClientComment(id, body),
    onSuccess: () => { setReply(""); setReplyTo(null); void refresh() },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível responder."),
  })

  if (query.isLoading || (!roots.length && !query.isError)) return null
  const open = roots.filter((comment) => !comment.resolved)
  const visible = showResolved ? roots : open
  const pinNumbers = new Map(roots.filter((comment) => comment.x !== null).map((comment, index) => [comment.id, index + 1]))

  return <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-800"><MessageSquare size={13} />Observações do cliente ({open.length})</p>
      {roots.length > open.length && <button type="button" className="text-[11px] font-semibold text-amber-800 underline-offset-2 hover:underline" onClick={() => setShowResolved((value) => !value)}>{showResolved ? "Ocultar resolvidas" : `Ver resolvidas (${roots.length - open.length})`}</button>}
    </div>
    {query.isError && <p className="mt-2 text-xs text-rose-700">Não foi possível carregar as observações.</p>}
    {!visible.length && !query.isError && <p className="mt-2 text-xs text-slate-500">Tudo resolvido por aqui.</p>}
    <ul className="mt-2 space-y-2">
      {visible.map((comment) => {
        const replies = comments.filter((item) => item.parentId === comment.id)
        return <li key={comment.id} className={cn("rounded-lg border bg-white p-2.5", comment.resolved ? "border-slate-200 opacity-70" : "border-amber-200")}>
          <div className="flex items-start gap-2">
            {pinNumbers.has(comment.id) && <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white" title={`Marcador na mídia ${(comment.mediaIndex ?? 0) + 1}`}>{pinNumbers.get(comment.id)}</span>}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500"><span className="font-semibold text-slate-800">{comment.authorName}</span> · {formatCommentTime(comment.createdAt)}{comment.link ? ` · ${comment.link.name}` : ""}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{comment.body}</p>
              {comment.x !== null && <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-700"><MapPin size={11} />Mídia {(comment.mediaIndex ?? 0) + 1} · {Math.round(comment.x)}% × {Math.round(comment.y ?? 0)}%</p>}
              {replies.map((item) => <div key={item.id} className="mt-2 border-l-2 border-indigo-200 pl-2">
                <p className="text-[11px] text-slate-500"><span className={cn("font-semibold", item.fromOwner ? "text-indigo-700" : "text-slate-800")}>{item.authorName}{item.fromOwner ? " (equipe)" : ""}</span> · {formatCommentTime(item.createdAt)}</p>
                <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{item.body}</p>
              </div>)}
              {replyTo === comment.id && <form className="mt-2 flex gap-1.5" onSubmit={(event) => { event.preventDefault(); if (reply.trim()) replyMutation.mutate({ id: comment.id, body: reply.trim() }) }}>
                <input autoFocus value={reply} onChange={(event) => setReply(event.target.value)} maxLength={1000} placeholder="Responder ao cliente…" className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-xs" />
                <button type="submit" disabled={!reply.trim() || replyMutation.isPending} aria-label="Enviar resposta" className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white disabled:opacity-50"><Send size={13} /></button>
              </form>}
              <div className="mt-1.5 flex gap-3 text-[11px] font-semibold">
                {replyTo !== comment.id && <button type="button" className="text-indigo-700 hover:underline" onClick={() => { setReplyTo(comment.id); setReply("") }}>Responder</button>}
                <button type="button" disabled={resolveMutation.isPending} className={cn("inline-flex items-center gap-1 hover:underline", comment.resolved ? "text-slate-600" : "text-emerald-700")} onClick={() => resolveMutation.mutate({ id: comment.id, resolved: !comment.resolved })}>
                  {comment.resolved ? <><RotateCcw size={11} />Reabrir</> : <><CheckCircle2 size={11} />Resolver</>}
                </button>
              </div>
            </div>
          </div>
        </li>
      })}
    </ul>
  </section>
}
