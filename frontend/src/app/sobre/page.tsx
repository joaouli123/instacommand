import type { Metadata } from "next"
import { ProductOverview } from "@/components/brand/ProductOverview"

export const metadata: Metadata = {
  title: "Sobre o UX Code Social — About the service",
  description: "Produto independente da UX Code: funcionalidades, conexão oficial de contas, identidade da empresa e suporte. Independent social account management service.",
}

export default function AboutPage() { return <ProductOverview /> }
