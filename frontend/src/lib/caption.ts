/**
 * The text that reaches the networks: the caption followed by the hashtags not
 * already written in it, after a blank line. Same rule as the composer's
 * publish step and the server (`mergeHashtagsIntoCaption`).
 */
export function captionAsPublished(caption: string | null | undefined, hashtags: readonly string[] | null | undefined) {
  const base = (caption || "").trim()
  const existing = new Set((base.match(new RegExp("#[\\p{L}\\p{N}_]+", "gu")) || []).map((tag) => tag.toLowerCase()))
  const extra: string[] = []
  for (const raw of hashtags || []) {
    const tag = String(raw).trim().replace(/^#+/, "")
    if (!tag || existing.has(`#${tag}`.toLowerCase())) continue
    existing.add(`#${tag}`.toLowerCase())
    extra.push(`#${tag}`)
  }
  return [base, extra.join(" ")].filter(Boolean).join("\n\n")
}
