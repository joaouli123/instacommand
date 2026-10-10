import type { Metadata } from "next"
import { DataDeletionDocument } from "@/components/legal/DataDeletion"

// English URL for the same bilingual document; the English version is shown first.
export const metadata: Metadata = {
  title: "Data Deletion | InstaCommand",
  description: "How to request the removal of your InstaCommand data, how to revoke access, and what happens to content already published on social networks.",
  robots: { index: true, follow: true },
}

export default function DataDeletionEnPage() {
  return <DataDeletionDocument primary="en" />
}
