import type { Metadata } from "next"
import { PrivacyPolicyDocument } from "@/components/legal/PrivacyPolicy"

// English URL for the same bilingual document; the English version is shown first.
export const metadata: Metadata = {
  title: "Privacy Policy | InstaCommand",
  description: "Learn which data InstaCommand processes, what it is used for, who it may be shared with, and how to request its deletion.",
  robots: { index: true, follow: true },
}

export default function PrivacyPolicyEnPage() {
  return <PrivacyPolicyDocument primary="en" />
}
