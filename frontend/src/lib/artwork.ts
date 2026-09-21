export type ArtSlide = { title: string; body: string }
export type ArtTheme = 'violet' | 'blue' | 'sand'
export const artThemes = {
  violet: { background: '#f5f3ff', ink: '#1e1b4b', accent: '#6d28d9' },
  blue: { background: '#eff6ff', ink: '#172554', accent: '#0369a1' },
  sand: { background: '#fffbeb', ink: '#451a03', accent: '#92400e' },
}
export function wrapArtText(text: string, width: number, measure: (text: string) => number) {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (measure(word) > width) {
        if (line) { lines.push(line); line = '' }
        for (const letter of Array.from(word)) {
          if (line && measure(line + letter) > width) { lines.push(line); line = '' }
          line += letter
        }
      } else if (line && measure(`${line} ${word}`) > width) { lines.push(line); line = word }
      else line = line ? `${line} ${word}` : word
    }
    lines.push(line)
  }
  return lines
}
export function validateArtSlides(slides: ArtSlide[]) {
  if (!slides.length || slides.length > 10) throw new Error('Use entre 1 e 10 páginas.')
  for (const [index, slide] of Array.from(slides.entries())) {
    if (!slide.title.trim() || slide.title.length > 120 || slide.body.length > 700) throw new Error(`Revise a página ${index + 1}: título obrigatório (até 120 caracteres) e texto de até 700 caracteres.`)
  }
}
function drawBlock(ctx: CanvasRenderingContext2D, text: string, y: number, height: number, maxFont: number, minFont: number, bold: boolean) {
  for (let size = maxFont; size >= minFont; size -= 2) {
    ctx.font = `${bold ? '700' : '400'} ${size}px Arial, sans-serif`
    const lines = wrapArtText(text, 904, value => ctx.measureText(value).width)
    const lineHeight = size * 1.3
    if (lines.length * lineHeight <= height) {
      lines.forEach((line, index) => ctx.fillText(line, 88, y + index * lineHeight))
      return
    }
  }
  throw new Error('O texto não cabe na arte. Reduza o conteúdo ou divida em mais páginas.')
}
export function renderArt(canvas: HTMLCanvasElement, slide: ArtSlide, theme: ArtTheme, signature: string, index: number, total: number) {
  validateArtSlides([slide])
  canvas.width = 1080; canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Seu navegador não conseguiu criar a arte.')
  const palette = artThemes[theme]
  ctx.fillStyle = palette.background; ctx.fillRect(0, 0, 1080, 1350)
  ctx.fillStyle = palette.accent; ctx.fillRect(88, 88, 112, 12)
  ctx.textBaseline = 'top'; ctx.fillStyle = palette.ink
  drawBlock(ctx, slide.title, 160, 370, 82, 42, true)
  drawBlock(ctx, slide.body, 570, 570, 42, 24, false)
  ctx.fillStyle = palette.accent; ctx.fillRect(88, 1190, 904, 2)
  ctx.font = '400 24px Arial, sans-serif'
  ctx.fillText(signature.slice(0, 50), 88, 1240, 720)
  ctx.textAlign = 'right'; ctx.fillText(`${index + 1} / ${total}`, 992, 1240); ctx.textAlign = 'left'
}
export async function artFiles(slides: ArtSlide[], theme: ArtTheme, signature: string): Promise<File[]> {
  validateArtSlides(slides)
  const files: File[] = []
  for (const [index, slide] of Array.from(slides.entries())) {
    const canvas = document.createElement('canvas')
    renderArt(canvas, slide, theme, signature, index, slides.length)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Falha ao exportar a arte.')), 'image/jpeg', 0.94))
    files.push(new File([blob], `arte-${String(index + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }))
  }
  return files
}
