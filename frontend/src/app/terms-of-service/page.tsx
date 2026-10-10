import type { Metadata } from "next"
import { TermsOfServiceDocument } from "@/components/legal/TermsOfService"

// English URL for the same bilingual document; the English version is shown first.
export const metadata: Metadata = {
  title: "Terms of Service | InstaCommand",
  description: "Rules for accessing and using InstaCommand, including social network integrations, posts, and automations.",
  robots: { index: true, follow: true },
}

export default function TermsOfServiceEnPage() {
  return <TermsOfServiceDocument primary="en" />
}
