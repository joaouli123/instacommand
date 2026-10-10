import type { Metadata } from "next"
import { PrivacyPolicyDocument } from "@/components/legal/PrivacyPolicy"

export const metadata: Metadata = {
  title: "Política de Privacidade | InstaCommand",
  description: "Saiba quais dados o InstaCommand trata, para que são usados, com quem podem ser compartilhados e como pedir sua exclusão.",
  robots: { index: true, follow: true },
}

export default function PrivacyPolicyPage() {
  return <PrivacyPolicyDocument primary="pt" />
}
