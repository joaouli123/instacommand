// Small text helpers shared by the report page and the PDF builder. Kept apart
// from report-pdf so the page does not pull jsPDF/react-dom/server on load.
/** Truncates by code point so emoji are never cut in half. */
export const clip = (text: string, max: number) => Array.from(text).slice(0, max).join("")
/** "Dados fornecidos pela Meta e pelo X" for the networks in the report. */
export const dataSource = (networks: string[]) => {
  const providers = [
    networks.some((n) => ["INSTAGRAM", "FACEBOOK", "THREADS"].includes(n)) && "pela Meta",
    networks.includes("X") && "pelo X",
    networks.includes("YOUTUBE") && "pelo YouTube",
  ].filter(Boolean) as string[]
  const list = providers.length > 1 ? `${providers.slice(0, -1).join(", ")} e ${providers.at(-1)}` : providers[0] || "pela Meta"
  return `Dados fornecidos ${list}`
}
