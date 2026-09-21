'use client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { artFiles, renderArt, type ArtSlide, type ArtTheme } from '@/lib/artwork'

export function ArtworkStudio({ onUse, disabled }: { onUse: (files: File[]) => void; disabled?: boolean }) {
  const [slides, setSlides] = useState<ArtSlide[]>([{ title: 'Seu título aqui', body: 'Edite este texto para criar sua primeira arte. Você pode transformar a ideia em um carrossel adicionando páginas.' }])
  const [active, setActive] = useState(0)
  const [theme, setTheme] = useState<ArtTheme>('violet')
  const [signature, setSignature] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!canvas.current) return
    try { renderArt(canvas.current, slides[active], theme, signature, active, slides.length); setError('') }
    catch (failure) { canvas.current.getContext('2d')?.clearRect(0, 0, 1080, 1350); setError(failure instanceof Error ? failure.message : 'Não foi possível desenhar a prévia.') }
  }, [slides, active, theme, signature])
  const edit = (key: keyof ArtSlide, value: string) => setSlides(current => current.map((slide, index) => index === active ? { ...slide, [key]: value } : slide))
  const move = (direction: number) => {
    const next = active + direction
    if (next < 0 || next >= slides.length) return
    const ordered = [...slides]; [ordered[active], ordered[next]] = [ordered[next], ordered[active]]; setSlides(ordered); setActive(next)
  }
  const use = async () => {
    setBusy(true)
    try { onUse(await artFiles(slides, theme, signature)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível gerar as imagens.') }
    finally { setBusy(false) }
  }
  return <details className="rounded-xl border border-indigo-100 bg-white p-4"><summary className="cursor-pointer font-semibold text-indigo-800">Criar arte ou carrossel aqui</summary><div className="mt-4 space-y-4">
    <p className="text-sm text-slate-600">Editor de modelos, sem custo de IA. Crie até 10 páginas em JPEG 1080 × 1350 (4:5). Edite os exemplos antes de usar. Nada é enviado ao servidor até você salvar ou publicar o post.</p>
    <fieldset disabled={busy || disabled} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Estilo<select className="mt-1 block w-full rounded-lg border p-2" value={theme} onChange={event => setTheme(event.target.value as ArtTheme)}><option value="violet">Violeta claro</option><option value="blue">Azul claro</option><option value="sand">Areia</option></select></label><label className="text-sm font-medium">Assinatura ou @perfil<input className="mt-1 block w-full rounded-lg border p-2" maxLength={50} value={signature} onChange={event => setSignature(event.target.value)} /></label></div>
      <div className="flex flex-wrap gap-2" aria-label="Páginas da arte">{slides.map((_, index) => <button type="button" key={index} aria-pressed={active === index} onClick={() => setActive(index)} className={`rounded-lg border px-3 py-2 text-sm ${active === index ? 'bg-indigo-600 text-white' : 'bg-white'}`}>Página {index + 1}</button>)}<Button type="button" variant="outline" disabled={slides.length >= 10} onClick={() => { setSlides(current => [...current, { title: 'Novo título', body: 'Desenvolva a próxima ideia aqui.' }]); setActive(slides.length) }}>Adicionar página</Button></div>
      <div className="grid items-start gap-4 md:grid-cols-2"><div className="space-y-3"><label className="block text-sm font-medium">Título da página {active + 1}<textarea className="mt-1 min-h-24 w-full rounded-lg border p-2" maxLength={120} value={slides[active].title} onChange={event => edit('title', event.target.value)} /></label><label className="block text-sm font-medium">Texto da página {active + 1}<textarea className="mt-1 min-h-40 w-full rounded-lg border p-2" maxLength={700} value={slides[active].body} onChange={event => edit('body', event.target.value)} /></label><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={active === 0} onClick={() => move(-1)}>Mover antes</Button><Button type="button" variant="outline" disabled={active === slides.length - 1} onClick={() => move(1)}>Mover depois</Button><Button type="button" variant="outline" disabled={slides.length === 1} onClick={() => { setSlides(current => current.filter((_, index) => index !== active)); setActive(Math.max(0, active - 1)) }}>Remover página</Button></div></div><canvas ref={canvas} aria-label={`Prévia da arte, página ${active + 1}`} className="h-auto w-full rounded-xl border shadow-sm" /></div>
      <Button type="button" onClick={use} disabled={busy || !!error || disabled}>{busy ? 'Preparando imagens...' : `Usar ${slides.length === 1 ? 'arte' : `${slides.length} artes`} neste post`}</Button>
    </fieldset>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <p className="text-xs text-slate-500">As páginas substituem a seleção de mídias após sua confirmação. O texto do editor não é salvo como projeto: depois de anexar as artes, salve o rascunho do post para preservar os JPEGs. Este recurso usa modelos gráficos, não gera fotografias com IA.</p>
  </div></details>
}
