import type { Metadata } from "next"
import { PrivacyPolicyDocument } from "@/components/legal/PrivacyPolicy"

// English URL for the same bilingual document; the English version is shown first.
export const metadata: Metadata = {
  title: "Privacy Policy | UX Code Social",
  description: "Learn which data UX Code Social processes, what it is used for, who it may be shared with, and how to request its deletion.",
  robots: { index: true, follow: true },
}

export default function PrivacyPolicyEnPage() {
  return <PrivacyPolicyDocument primary="en" />
}
