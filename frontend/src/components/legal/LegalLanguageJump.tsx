"use client"

import { useEffect, useRef } from "react"
import { useLang } from "@/lib/i18n"

/** On the Portuguese URLs, people using the app in English land on the English version. */
export function LegalLanguageJump() {
  const { lang } = useLang()
  const jumped = useRef(false)

  useEffect(() => {
    if (jumped.current || lang !== "en" || window.location.hash) return
    jumped.current = true
    document.getElementById("english")?.scrollIntoView()
  }, [lang])

  return null
}
