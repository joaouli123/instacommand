"use client"

import dynamic from "next/dynamic"

// recharts is ~100KB gzipped; loading it in its own chunk lets the page shell,
// cards and tables paint before the charts arrive.
function ChartPlaceholder() {
  return <div aria-hidden className="h-[360px] w-full animate-pulse rounded-xl border border-slate-200 bg-white" />
}

export const ReportChart = dynamic(() => import("./ReportChart").then((m) => m.ReportChart), { ssr: false, loading: ChartPlaceholder })
