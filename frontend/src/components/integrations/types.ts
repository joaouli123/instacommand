export type ScopeInfo = { id: string; label: string; description: string }

export type CatalogParam = { name: string; required: boolean; type: string; description: string | null }

export type CatalogTool = {
  name: string
  title: string
  category: string
  description: string
  scopes: string[]
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean } | null
  requiresConfirmation: boolean
  params: CatalogParam[]
  localOnly: boolean
}

export type IntegrationsCatalog = {
  serverVersion: string
  urls: { mcp: string; api: string; cliDownload: string; authorizationServerMetadata: string; protectedResourceMetadata: string }
  scopes: ScopeInfo[]
  tokenDurations: number[]
  maxPersonalTokens: number
  categories: Record<string, string>
  tools: CatalogTool[]
}

export type PersonalToken = {
  id: string
  name: string
  tokenPrefix: string
  scopes: string[]
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
  expired: boolean
}

export type OAuthGrant = {
  id: string
  name: string
  scopes: string[]
  lastUsedAt: string | null
  createdAt: string
  refreshExpiresAt: string | null
  oauthClient: { clientName: string; clientUri: string | null; registrationType: string } | null
}

export type TokenList = { personal: PersonalToken[]; oauth: OAuthGrant[] }
