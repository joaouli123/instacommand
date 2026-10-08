// Small text helpers shared by the report page and the PDF builder. Kept apart
// from report-pdf so the page does not pull jsPDF/react-dom/server on load.
/** Truncates by code point so emoji are never cut in half. */
export const clip = (text: string, max: number) => Array.from(text).slice(0, max).join("")
/** "Dados fornecidos pela Meta e pelo X" for the networks in the report. */
export const dataSource = (networks: string[]) => { const meta = networks.some((n) => n !== "X"), x = networks.includes("X"); return `Dados fornecidos ${meta && x ? "pela Meta e pelo X" : x ? "pelo X" : "pela Meta"}` }
