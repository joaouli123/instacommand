import { cookies } from "next/headers"

/** Display hint only. Every private API still validates the session server-side. */
export async function hasBrowserSessionHint(): Promise<boolean> {
  const name = process.env.NODE_ENV === "production" ? "__Host-instacommand_session" : "instacommand_session"
  const matches = (await cookies()).getAll(name)
  return matches.length === 1 && Boolean(matches[0].value)
}
