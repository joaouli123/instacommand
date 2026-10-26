import type { Metadata } from "next"
import { DataDeletionDocument } from "@/components/legal/DataDeletion"

export const metadata: Metadata = {
  title: "Exclusão de Dados | UX Code Social",
  description: "Veja como solicitar a remoção dos dados do UX Code Social e o que acontece com conteúdo publicado nas redes sociais.",
  robots: { index: true, follow: true },
}

export default function DataDeletionPage() {
  return <DataDeletionDocument primary="pt" />
}
