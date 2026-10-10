import type { Metadata } from "next"
import { TermsOfServiceDocument } from "@/components/legal/TermsOfService"

export const metadata: Metadata = {
  title: "Termos de Serviço | InstaCommand",
  description: "Regras de acesso e uso do InstaCommand, incluindo integrações com redes sociais, publicações e automações.",
  robots: { index: true, follow: true },
}

export default function TermsOfServicePage() {
  return <TermsOfServiceDocument primary="pt" />
}
