'use client'

import { useEffect, useRef, useState } from 'react'
import { api, fetchApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import toast from 'react-hot-toast'
import { tr, useT } from '@/lib/i18n'

type Analysis = { summary: string; observations: Array<{ imageIndex: number; evidence: string; interpretation: string }>; limitations: string[]; actions: string[]; bioSuggestion?: string; nameSuggestion?: string; contentIdeas: string[] }
type Print = { id: string; file: File; url: string }

export function ScreenshotAnalysis() {
  const t = useT()
  const [prints, setPrints] = useState<Print[]>([])
  const [platform, setPlatform] = useState('Instagram')
  const [objective, setObjective] = useState('')
  const [audience, setAudience] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Analysis | null>(null)
  const [error, setError] = useState('')
  const [provider, setProvider] = useState<{ apiKeyConfigured: boolean; source: string; model: string } | null>(null)
  const urls = useRef<string[]>([])
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    api.getAiSettings().then(value => { if (alive.current) setProvider(value) }).catch(() => { if (alive.current) setError(tr('Não foi possível verificar a configuração da IA. Recarregue a página.')) })
    return () => { alive.current = false; urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current = [] }
  }, [])
  const ready = provider?.apiKeyConfigured && ['server', 'workspace'].includes(provider.source)
  const select = (files: File[]) => {
    if (!files.length) return
    if (files.length + prints.length > 3) { setError(t('Selecione até 3 prints no total.')); return }
    if (files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024 || !file.size)) { setError(t('Use PNG, JPG ou WebP com até 4 MB por imagem.')); return }
    const added = files.map(file => ({ file, id: crypto.randomUUID(), url: URL.createObjectURL(file) }))
    urls.current.push(...added.map(item => item.url))
    setPrints(current => [...current, ...added]); setConsent(false); setResult(null); setError('')
  }
  const remove = (id: string) => {
    const image = prints.find(item => item.id === id)
    if (image) { URL.revokeObjectURL(image.url); urls.current = urls.current.filter(url => url !== image.url) }
    setPrints(current => current.filter(item => item.id !== id)); setConsent(false); setResult(null)
  }
  const analyze = async () => {
    if (!consent || !prints.length || busy || !ready) return
    setBusy(true); setError(''); setResult(null)
    const data = new FormData()
    prints.forEach(item => data.append('images', item.file))
    data.append('platform', platform); data.append('objective', objective); data.append('audience', audience); data.append('consent', 'true')
    try {
      const response = await fetchApi('/ai/analyze-images', { method: 'POST', body: data }) as { result: Analysis }
      if (alive.current) { setResult(response.result); toast.success(t('Análise dos prints pronta para revisão.')) }
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : t('Não foi possível analisar os prints.')) }
    finally { if (alive.current) setBusy(false) }
  }
  const copy = async () => {
    if (!result) return
    const text = [result.summary, ...result.observations.map(item => `${t('Print {index}', { index: item.imageIndex })}\n${t('Evidência')}: ${item.evidence}\n${t('Interpretação')}: ${item.interpretation}`), t('Limitações'), ...result.limitations, t('Próximas ações'), ...result.actions, result.nameSuggestion && `${t('Nome')}: ${result.nameSuggestion}`, result.bioSuggestion && `Bio: ${result.bioSuggestion}`, t('Ideias de conteúdo'), ...result.contentIdeas].filter(Boolean).join('\n\n')
    try { await navigator.clipboard.writeText(text); toast.success(t('Análise copiada.')) } catch { setError(t('O navegador não permitiu copiar. Selecione o texto do resultado manualmente.')) }
  }
  return <Card className="border-indigo-100 p-5"><details><summary className="cursor-pointer text-base font-bold text-slate-900">{t('Analisar prints do perfil ou insights com IA')}</summary>
    <div className="mt-4 space-y-4">
      <p className="text-sm text-slate-600">{t('Envie até 3 prints legíveis do perfil, feed ou insights do Instagram ou Facebook. A IA sugere melhorias de bio, posicionamento e conteúdo.')}</p>
      <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{t('Remova senhas, tokens, conversas privadas e dados de terceiros antes de selecionar imagens. Os prints serão enviados ao Google Gemini somente ao clicar em analisar. Não criamos arquivos públicos nem publicações a partir deles. O processamento está sujeito às políticas e à cota do provedor.')}</p>
      {!ready && <p className="text-sm text-slate-600">{provider ? <>{t('Configure o Gemini para analisar imagens.')} <a href="/settings" className="text-indigo-700 underline">{t('Abrir configurações')}</a></> : t('Verificando configuração da IA...')}</p>}
      <fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium">{t('Rede dos prints')}<select className="mt-1 block w-full rounded-lg border p-2" value={platform} onChange={event => { setPlatform(event.target.value); setConsent(false); setResult(null) }}><option>Instagram</option><option>Facebook</option></select></label>
          <label className="text-sm font-medium">{t('Objetivo da análise')}<input className="mt-1 block w-full rounded-lg border p-2" maxLength={500} value={objective} onChange={event => { setObjective(event.target.value); setConsent(false); setResult(null) }} placeholder={t('Ex.: melhorar minha bio para vender serviços')} /></label>
          <label className="text-sm font-medium">{t('Público que quero atrair')}<input className="mt-1 block w-full rounded-lg border p-2" maxLength={300} value={audience} onChange={event => { setAudience(event.target.value); setConsent(false); setResult(null) }} placeholder={t('Ex.: pequenos negócios da minha cidade')} /></label>
        </div>
        <label className="block rounded-xl border border-dashed border-indigo-200 bg-indigo-50/30 p-4 text-sm font-medium">{t('Escolher prints (PNG, JPG ou WebP · até 4 MB cada)')}<input aria-label={t('Prints para análise com IA')} className="mt-2 block max-w-full text-sm" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event => { select(Array.from(event.target.files || [])); event.target.value = '' }} /></label>
        <div className="grid gap-3 sm:grid-cols-3">{prints.map((item, index) => <figure key={item.id} className="rounded-xl border bg-slate-50 p-3"><img src={item.url} alt={t('Prévia do print {index}', { index: index + 1 })} className="h-48 w-full rounded object-contain"/><figcaption className="mt-2 truncate text-xs">{t('Print {index}', { index: index + 1 })} · {item.file.name}</figcaption><button type="button" onClick={() => remove(item.id)} className="mt-2 text-xs font-semibold text-rose-700">{t('Remover print {index}', { index: index + 1 })}</button></figure>)}</div>
        <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" className="mt-1" checked={consent} onChange={event => setConsent(event.target.checked)} />{t('Autorizo enviar estes prints, objetivo e público ao Google Gemini ({model}) para esta análise. O uso pode consumir minha cota de IA.', { model: provider?.model || t('modelo configurado') })}</label>
      </fieldset>
      <Button type="button" disabled={!ready || !consent || !prints.length || busy} onClick={analyze}>{busy ? t('Analisando prints...') : t('Enviar prints e analisar com Gemini')}</Button>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {result && <section aria-label={t('Resultado da análise de prints')} className="space-y-4 border-t pt-4"><h3 className="font-bold">{t('Análise para revisão')}</h3><p className="whitespace-pre-wrap text-sm">{result.summary}</p>
        {result.observations.map((item, index) => <article key={index} className="rounded-xl border bg-slate-50 p-3 text-sm"><h4 className="font-semibold">{t('Print {index}', { index: item.imageIndex })}</h4><p className="mt-1"><strong>{t('O que está visível:')}</strong> {item.evidence}</p><p className="mt-1"><strong>{t('Interpretação da IA:')}</strong> {item.interpretation}</p></article>)}
        {([['Limitações da análise', result.limitations], ['Próximas ações', result.actions], ['Ideias de conteúdo', result.contentIdeas]] as Array<[string, string[]]>).map(([title, items]) => <div key={title}><h4 className="font-semibold">{t(title)}</h4><ul className="ml-5 mt-2 list-disc space-y-2 text-sm">{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>)}
        {result.nameSuggestion && <p className="text-sm"><strong>{t('Sugestão de nome:')}</strong> {result.nameSuggestion}</p>}{result.bioSuggestion && <p className="whitespace-pre-wrap text-sm"><strong>{t('Sugestão de bio:')}</strong> {result.bioSuggestion}</p>}
        <p className="text-xs text-slate-500">{t('Sugestões, não alterações automáticas. Revise números e conclusões. Copie o resultado antes de sair; esta análise não é salva no histórico.')}</p><Button type="button" variant="outline" onClick={copy}>{t('Copiar análise')}</Button>
      </section>}
    </div>
  </details></Card>
}
