import DashboardPage from "@/components/dashboard/DashboardPage"
import { ProductOverview } from "@/components/brand/ProductOverview"
import { hasBrowserSessionHint } from "@/lib/browser-session-hint"

export default async function HomePage() {
  // No account queries or workspace chrome for anonymous visitors.
  return await hasBrowserSessionHint() ? <DashboardPage /> : <ProductOverview />
}
