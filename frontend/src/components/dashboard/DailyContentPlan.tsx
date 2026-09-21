'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

export type DailyPost = { topic: string; format: 'IMAGE' | 'CAROUSEL' | 'REEL'; caption: string; cta: string; hashtags: string[]; suggestedTime: string; creativeBrief: string; storyIdea: string; reason: string }
type Plan = { summary: string; timingNote: string; posts: DailyPost[] }
type Props = { accountId: string; topic: string; audience: string; tone: string; objective: string; onEdit: (post: DailyPost) => void }

export function DailyContentPlan({ accountId, topic, audience, tone, objective, onEdit }: Props) {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(false)
  const request = useRef(0)
  useEffect(() => { request.current++; setPlan(null); setLoading(false); return () => { request.current++ } }, [accountId])
  const generate = async () => {
    const version = ++request.current
    setLoading(true)
    try {
      const response = await api.generateAi({ mode: 'daily', accountId, topic, audience, tone, objective }) as { result: Plan }
      if (version !== request.current) return
      setPlan(response.result)
      toast.success('Plano de três posts pronto para revisão.')
    } catch (error) { if (version === request.current) toast.error(error instanceof Error ? error.message : 'Não foi possível gerar o plano.') }
    finally { if (version === request.current) setLoading(false) }
  }
  return <div className="space-y-3 border-t border-indigo-100 pt-4">
    <Button type="button" variant="outline" disabled={loading || !accountId} onClick={generate}>{loading ? 'Preparando seu dia...' : 'Planejar 3 posts para o dia'}</Button>
    <p className="text-xs text-slate-500">Usa o assunto, público e objetivo acima. Você revisa cada ideia antes de criar ou publicar. Nada é agendado automaticamente.</p>
    {plan && <div className="space-y-4"><p className="text-sm font-medium text-slate-800">{plan.summary}</p><p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{plan.timingNote} Fuso: São Paulo. O plano fica nesta tela; ainda não está salvo no calendário.</p>
      {plan.posts.map((post, index) => <article key={index} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900">{index + 1}. {post.topic}</h3><span className="text-xs text-indigo-700">{post.format === 'IMAGE' ? 'Imagem' : post.format === 'CAROUSEL' ? 'Carrossel' : 'Reel'} · {post.suggestedTime}</span></div>
        <p className="text-xs text-slate-500">Por que nessa ordem: {post.reason}</p>
        <label className="block text-xs font-semibold text-slate-600">Legenda editável<textarea className="mt-1 min-h-36 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal" maxLength={2200} value={post.caption} onChange={event => setPlan(current => current ? { ...current, posts: current.posts.map((item, i) => i === index ? { ...item, caption: event.target.value } : item) } : current)} /></label>
        <p className="text-xs text-slate-600">CTA sugerido: {post.cta}</p><p className="break-words text-xs text-indigo-700">{post.hashtags.map(tag => `#${tag.replace(/^#/, '')}`).join(' ')}</p>
        <details className="text-sm text-slate-700"><summary className="cursor-pointer font-semibold">Briefing da arte e ideia de Story</summary><p className="mt-2 whitespace-pre-wrap">{post.creativeBrief}</p><p className="mt-2 whitespace-pre-wrap">Story: {post.storyIdea}</p><p className="mt-2 text-xs text-slate-500">Este briefing ainda não é uma imagem ou vídeo gerado.</p></details>
        <Button type="button" variant="outline" onClick={() => onEdit(post)}>Editar este post no compositor</Button>
      </article>)}
    </div>}
  </div>
}
