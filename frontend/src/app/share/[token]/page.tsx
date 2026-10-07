"use client"

import { useParams } from "next/navigation"
import { PublicShareView } from "@/components/share/PublicShareView"

export default function SharePage() {
  const params = useParams<{ token: string }>()
  const token = typeof params?.token === "string" ? params.token : ""
  return <PublicShareView token={token} />
}
