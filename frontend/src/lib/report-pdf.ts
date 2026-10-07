import type { jsPDF as JsPDF } from "jspdf"
import { createElement, type ComponentType } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SiFacebook, SiInstagram, SiThreads, SiX } from "@icons-pack/react-simple-icons"
import { fetchApi } from "@/lib/api"

export type PdfChange = { direction: "up" | "down" | "flat"; percent: number | null }
export type PdfKpi = { label: string; value: string; previous?: string | null; change?: PdfChange | null }
export type PdfTable = { title: string; head: string[]; rows: Array<{ image?: string | null; cells: string[] }>; textColumns?: number }
export type PdfBars = { title: string; items: Array<{ label: string; value: number; color: string }>; format?: (value: number) => string }
export type PdfDaily = { title: string; labels: string[]; series: Array<{ name: string; color: string; values: Array<number | null> }> }
export type PdfSection = { title: string; subtitle: string; color: [number, number, number]; analysis: string; kpis: PdfKpi[]; daily?: PdfDaily | null; bars?: PdfBars[]; tables: PdfTable[] }
export type PdfReport = { title: string; subtitle: string; period: string; avatar?: string | null; initial: string; sections: PdfSection[]; footer: string }

// A4 portrait, millimetres.
const W = 210, H = 297, M = 14, CW = W - M * 2
const INK: [number, number, number] = [15, 23, 42], MUTED: [number, number, number] = [100, 116, 139], LINE: [number, number, number] = [226, 232, 240]
const hex = (value: string): [number, number, number] => { const v = value.replace("#", ""); return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)] }
const META_CDN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i

// The built-in PDF font only has Latin characters: emoji and other symbols
// would print as garbage ("Ø=Þá"), so they are removed from every text.
const EXTRA_CHARS = new Set(["–", "—", "‘", "’", "“", "”", "•", "…", "€", "™"])
export const pdfSafe = (value: string) => Array.from(value || "")
  .filter((char) => { const code = char.codePointAt(0)!; return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || char === "\n" || EXTRA_CHARS.has(char) })
  .join("").replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").trim()

const NETWORK_ICONS: Record<string, ComponentType<{ size?: number | string; color?: string }>> = { Instagram: SiInstagram, Facebook: SiFacebook, Threads: SiThreads, X: SiX }

/** White network logo as a PNG, rendered from the same icon set used on screen. */
async function networkIcon(title: string): Promise<string | null> {
  const Icon = NETWORK_ICONS[title]
  if (!Icon) return null
  try {
    let svg = renderToStaticMarkup(createElement(Icon, { size: 96, color: "#ffffff" }))
    if (!svg.includes("xmlns=")) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')
    const image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    await image.decode()
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 96
    canvas.getContext("2d")!.drawImage(image, 0, 0, 96, 96)
    return canvas.toDataURL("image/png")
  } catch { return null }
}

/** Square JPEG thumbnail (center crop) as a data URL; Meta CDN images come through the API because they lack CORS. */
export async function thumbnail(src?: string | null, size = 160): Promise<string | null> {
  if (!src) return null
  try {
    let url = src
    const parsed = new URL(src, window.location.href)
    if (parsed.protocol === "https:" && META_CDN.test(parsed.hostname)) url = (await fetchApi(`/analytics/media-preview?url=${encodeURIComponent(parsed.toString())}`) as { dataUrl: string }).dataUrl
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.src = url
    await image.decode()
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = size
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    canvas.getContext("2d")!.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size)
    return canvas.toDataURL("image/jpeg", 0.88)
  } catch { return null }
}

class Writer {
  y = M
  constructor(public doc: JsPDF) {}
  ensure(height: number) { if (this.y + height > H - M - 8) { this.doc.addPage(); this.y = M } }
  text(value: string, x: number, y: number, size: number, color = INK, style: "normal" | "bold" = "normal", align: "left" | "center" | "right" = "left") {
    this.doc.setFont("helvetica", style); this.doc.setFontSize(size); this.doc.setTextColor(...color)
    this.doc.text(pdfSafe(value), x, y, { align, baseline: "alphabetic" })
  }
}

function badge(w: Writer, change: PdfChange, centerX: number, y: number) {
  const { doc } = w
  const label = change.percent == null ? "novo" : `${change.percent > 0 ? "+" : ""}${change.percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
  const [bg, fg] = change.direction === "up" ? [[236, 253, 245], [4, 120, 87]] : change.direction === "down" ? [[255, 241, 242], [190, 18, 60]] : [[241, 245, 249], [71, 85, 105]]
  doc.setFont("helvetica", "bold"); doc.setFontSize(7)
  const width = doc.getTextWidth(label) + 7.5
  const x = centerX - width / 2
  doc.setFillColor(...(bg as [number, number, number])); doc.roundedRect(x, y - 3.4, width, 4.6, 1.2, 1.2, "F")
  doc.setFillColor(...(fg as [number, number, number]))
  const tx = x + 2.2, ty = y - 1.1
  if (change.direction === "up") doc.triangle(tx - 1.2, ty + 0.9, tx + 1.2, ty + 0.9, tx, ty - 1.1, "F")
  else if (change.direction === "down") doc.triangle(tx - 1.2, ty - 1.1, tx + 1.2, ty - 1.1, tx, ty + 0.9, "F")
  else { doc.rect(tx - 1.1, ty - 0.8, 2.2, 0.5, "F"); doc.rect(tx - 1.1, ty + 0.2, 2.2, 0.5, "F") }
  w.text(label, x + 4.2, y, 7, fg as [number, number, number], "bold")
}

function kpiGrid(w: Writer, kpis: PdfKpi[]) {
  const columns = 4, gap = 3, cardW = (CW - gap * (columns - 1)) / columns, cardH = 21
  for (let index = 0; index < kpis.length; index += columns) {
    w.ensure(cardH + gap)
    kpis.slice(index, index + columns).forEach((kpi, column) => {
      const x = M + column * (cardW + gap), cx = x + cardW / 2
      w.doc.setDrawColor(...LINE); w.doc.setLineWidth(0.25); w.doc.setFillColor(255, 255, 255); w.doc.roundedRect(x, w.y, cardW, cardH, 2, 2, "FD")
      w.text(kpi.label, cx, w.y + 5.2, 7.5, MUTED, "normal", "center")
      w.text(kpi.value, cx, w.y + 11.8, 14, INK, "bold", "center")
      if (kpi.change) {
        badge(w, kpi.change, cx, w.y + 16.4)
        if (kpi.previous != null) w.text(`${kpi.previous} no período anterior`, cx, w.y + 19.6, 5.8, MUTED, "normal", "center")
      }
    })
    w.y += cardH + gap
  }
  w.y += 2
}

function heading(w: Writer, title: string) {
  w.ensure(12)
  w.text(title, M, w.y + 4, 10.5, INK, "bold")
  w.y += 8
}

function paragraph(w: Writer, value: string) {
  w.doc.setFont("helvetica", "normal"); w.doc.setFontSize(9)
  for (const line of pdfSafe(value).split("\n").flatMap((text) => w.doc.splitTextToSize(text, CW) as string[])) {
    w.ensure(5)
    w.text(line, M, w.y + 3.5, 9, [51, 65, 85])
    w.y += 4.6
  }
  w.y += 3
}

function dailyChart(w: Writer, chart: PdfDaily) {
  const height = 52
  w.ensure(height + 14)
  heading(w, chart.title)
  const { doc } = w, left = M + 12, top = w.y, width = CW - 12, plotH = height - 10
  const max = Math.max(1, ...chart.series.flatMap((s) => s.values.filter((v): v is number => v != null)))
  const nice = Math.pow(10, Math.floor(Math.log10(max))), top_ = Math.ceil(max / nice) * nice
  doc.setLineWidth(0.15); doc.setDrawColor(...LINE)
  for (let i = 0; i <= 4; i++) {
    const y = top + plotH - plotH * i / 4
    doc.line(left, y, left + width, y)
    w.text(Math.round(top_ * i / 4).toLocaleString("pt-BR"), left - 2, y + 1, 6, MUTED, "normal", "right")
  }
  const n = chart.labels.length, step = n > 1 ? width / (n - 1) : 0
  const every = Math.max(1, Math.ceil(n / 8))
  chart.labels.forEach((label, i) => { if (i % every === 0 || i === n - 1) w.text(label, left + i * step, top + plotH + 4.5, 6, MUTED, "normal", "center") })
  for (const series of chart.series) {
    doc.setDrawColor(...hex(series.color)); doc.setLineWidth(0.7)
    let previous: [number, number] | null = null
    series.values.forEach((value, i) => {
      if (value == null) { previous = null; return }
      const point: [number, number] = [left + i * step, top + plotH - plotH * value / top_]
      if (previous) doc.line(previous[0], previous[1], point[0], point[1])
      previous = point
    })
  }
  let lx = left
  for (const series of chart.series) {
    doc.setFillColor(...hex(series.color)); doc.circle(lx + 1, top + plotH + 9, 1, "F")
    w.text(series.name, lx + 3, top + plotH + 10, 7, MUTED); lx += doc.getTextWidth(series.name) + 10
  }
  w.y += height + 6
}

function barChart(w: Writer, chart: PdfBars, x: number, width: number, y: number) {
  const { doc } = w
  w.text(chart.title, x, y + 4, 9, INK, "bold")
  const max = Math.max(1, ...chart.items.map((item) => item.value))
  const labelW = 22, barArea = width - labelW - 14
  chart.items.forEach((item, i) => {
    const by = y + 9 + i * 8
    w.text(item.label, x, by + 3.6, 7.5, [51, 65, 85])
    doc.setFillColor(...hex(item.color)); doc.roundedRect(x + labelW, by, Math.max(1.5, barArea * item.value / max), 5, 1.2, 1.2, "F")
    w.text(chart.format ? chart.format(item.value) : item.value.toLocaleString("pt-BR"), x + labelW + barArea * item.value / max + 2, by + 3.7, 7.5, INK, "bold")
  })
  return 9 + chart.items.length * 8 + 4
}

async function table(w: Writer, data: PdfTable) {
  if (!data.rows.length) return
  const { autoTable } = await import("jspdf-autotable")
  w.ensure(30)
  heading(w, data.title)
  const hasImages = data.rows.some((row) => row.image)
  const textColumns = data.textColumns ?? 1
  autoTable(w.doc, {
    startY: w.y,
    margin: { left: M, right: M, bottom: M + 8 },
    head: [data.head.map(pdfSafe)],
    body: data.rows.map((row) => row.cells.map(pdfSafe)),
    theme: "plain",
    styles: { font: "helvetica", fontSize: 7.5, textColor: INK, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 }, valign: "middle", overflow: "linebreak" },
    headStyles: { fontSize: 7, textColor: MUTED, fontStyle: "bold", fillColor: [248, 250, 252] },
    columnStyles: Object.fromEntries(data.head.map((_, index) => [index, index < textColumns ? { halign: "left", cellWidth: index === 0 ? (hasImages ? 64 : 80) : "auto" } : { halign: "right" }])),
    rowPageBreak: "avoid",
    didParseCell: (hook) => {
      if (hook.section === "head" && hook.column.index >= textColumns) hook.cell.styles.halign = "right"
      if (hook.section === "body" && hook.column.index === 0 && hasImages) { hook.cell.styles.cellPadding = { top: 2.2, bottom: 2.2, left: 14, right: 2 }; hook.cell.styles.minCellHeight = 13 }
    },
    didDrawCell: (hook) => {
      if (hook.section === "body") { w.doc.setDrawColor(...LINE); w.doc.setLineWidth(0.15); w.doc.line(hook.cell.x, hook.cell.y + hook.cell.height, hook.cell.x + hook.cell.width, hook.cell.y + hook.cell.height) }
      const image = hook.section === "body" && hook.column.index === 0 ? data.rows[hook.row.index]?.image : null
      if (image) w.doc.addImage(image, "JPEG", hook.cell.x + 2, hook.cell.y + (hook.cell.height - 10) / 2, 10, 10)
    },
  })
  w.y = (w.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
}

/** Builds the report as a real PDF (vector text and charts) and downloads it. */
export async function downloadReportPdf(report: PdfReport, filename: string) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true })
  const w = new Writer(doc)

  // Cover header
  const cx = W / 2
  if (report.avatar) {
    doc.addImage(report.avatar, "JPEG", cx - 9, w.y, 18, 18)
  } else {
    doc.setFillColor(79, 70, 229); doc.circle(cx, w.y + 9, 9, "F")
    w.text(report.initial, cx, w.y + 12, 14, [255, 255, 255], "bold", "center")
  }
  w.y += 26
  w.text(report.title, cx, w.y, 18, INK, "bold", "center"); w.y += 6
  w.text(report.subtitle, cx, w.y, 10, MUTED, "normal", "center"); w.y += 8
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5)
  for (const line of doc.splitTextToSize(report.period, 140) as string[]) { w.text(line, cx, w.y, 8.5, [71, 85, 105], "normal", "center"); w.y += 4.5 }
  w.y += 6

  for (const section of report.sections) {
    w.ensure(60)
    doc.setFillColor(...section.color); doc.rect(M, w.y, CW, 1.2, "F")
    // Breathing room between the colour bar and the network name.
    w.y += 6
    doc.setFillColor(...section.color); doc.roundedRect(M, w.y, 11, 11, 2.4, 2.4, "F")
    const icon = await networkIcon(section.title)
    if (icon) doc.addImage(icon, "PNG", M + 2.25, w.y + 2.25, 6.5, 6.5)
    else w.text(section.title.slice(0, 1), M + 5.5, w.y + 7.3, 10, [255, 255, 255], "bold", "center")
    w.text(section.title, M + 14.5, w.y + 5, 13, INK, "bold")
    w.text(section.subtitle, M + 14.5, w.y + 9.6, 8, MUTED)
    w.y += 19

    if (section.analysis.trim()) { heading(w, "Análise do período"); paragraph(w, section.analysis) }
    if (section.kpis.length) kpiGrid(w, section.kpis)
    if (section.daily) dailyChart(w, section.daily)
    const bars = (section.bars || []).filter((chart) => chart.items.length)
    if (bars.length) {
      const columnW = bars.length > 1 ? (CW - 8) / 2 : CW
      const height = Math.max(...bars.map((chart) => 13 + chart.items.length * 8))
      w.ensure(height)
      bars.forEach((chart, index) => barChart(w, chart, M + index * (columnW + 8), columnW, w.y))
      w.y += height + 4
    }
    for (const data of section.tables) await table(w, data)
    w.y += 4
  }

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setDrawColor(...LINE); doc.setLineWidth(0.15); doc.line(M, H - M - 3, W - M, H - M - 3)
    w.text(report.footer, M, H - M + 1, 6.5, MUTED)
    w.text(`Página ${page} de ${pages}`, W - M, H - M + 1, 6.5, MUTED, "normal", "right")
  }
  doc.save(filename)
}
