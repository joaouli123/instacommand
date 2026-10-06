# MCP e CLI do InstaCommand

O InstaCommand expõe todo o workspace para agentes de IA (Claude, ChatGPT, Cursor, VS Code, Codex, Gemini e qualquer cliente MCP) e para o terminal. A documentação para o usuário final fica no próprio app, na página **MCP e CLI** do menu lateral (`/integrations`), com instruções já preenchidas com a URL do servidor e, opcionalmente, com um token recém-criado.

Este documento descreve a arquitetura, a segurança e a operação.

## Visão geral

| Peça | Onde | Para quê |
| --- | --- | --- |
| Servidor MCP remoto | `POST {BACKEND_URL}/mcp` | Streamable HTTP, sem sessão (stateless), respostas JSON. 58 ferramentas e 4 prompts. |
| Servidor de autorização OAuth 2.1 | `{BACKEND_URL}/oauth/*` e `/.well-known/*` | Conexão de ChatGPT, Claude (web/desktop/celular), Claude Code e Cursor sem copiar tokens. |
| Tokens pessoais | Página MCP e CLI › Tokens | CLI, IDEs e clientes que usam cabeçalho `Authorization: Bearer`. |
| CLI | `GET {BACKEND_URL}/downloads/instacommand.cjs` | Um arquivo, zero dependências (Node 18+). Comandos amigáveis, `call` para qualquer ferramenta e `mcp` (ponte stdio). |

Código:

- `backend/src/mcp/` — catálogo de ferramentas (`tools/*.ts`), servidor (`server.ts`), cliente interno da API (`internal-api.ts`), guia de publicação (`guide.ts`).
- `backend/src/routes/mcp.routes.ts`, `oauth.routes.ts`, `oauth-consent.routes.ts`, `integrations.routes.ts`, `downloads.routes.ts`.
- `backend/src/services/api-tokens.service.ts`, `api-scopes.ts`, `oauth.service.ts`, `media-import.service.ts`; `backend/src/utils/safe-fetch.ts`, `media-signature.ts`.
- `backend/src/cli/instacommand.ts` — CLI (compilado para `dist/cli/instacommand.js`).
- `frontend/src/app/integrations/page.tsx`, `frontend/src/app/oauth/authorize/page.tsx`, `frontend/src/components/integrations/*`, `frontend/src/lib/mcp-setup.ts`.

### Mesmas regras do painel

Cada ferramenta MCP executa pela **mesma API REST** usada pelo painel, por chamadas internas em loopback (`http://127.0.0.1:{BACKEND_PORT}/api/...`) com o token do chamador. Assim, toda validação de formatos, limites, propriedade de contas e estados de publicação é idêntica à do compositor — não existe um segundo caminho de escrita. Os tokens OAuth, que são vinculados ao recurso `/mcp`, só são aceitos pela API REST quando a chamada vem do próprio servidor MCP (cabeçalho com um segredo aleatório gerado por processo e verificado apenas para conexões de loopback).

## Permissões (escopos)

| Escopo | Permite |
| --- | --- |
| `read` | Ler contas, publicações, calendário, relatórios, comentários, automações e configurações. |
| `write` | Criar e editar rascunhos, enviar mídias, gerar conteúdo com IA, gerenciar automações desativadas, concorrentes e preferências. |
| `publish` | Publicar agora, agendar, editar algo agendado, excluir algo publicado, responder/excluir comentários, enviar respostas revisadas, ativar automações e o envio automático do agente. |
| `admin` | Conectar e desconectar contas, ativar contas pendentes, inscrever webhooks e alterar credenciais de apps e da IA. |

A política fica em `backend/src/services/api-scopes.ts` e é aplicada no middleware `authenticate` a **toda** requisição autenticada por token:

- `GET` exige `read` (exceto geração de links de conexão, que exige `admin`).
- Rotas de escrita estão listadas explicitamente; **qualquer rota de escrita não listada exige `admin`** (falha fechada para rotas futuras).
- Requisitos que dependem do estado do post (editar algo agendado, excluir algo publicado) consultam o banco.
- `/api/integrations/*` e `/api/oauth/*` são **somente sessão do navegador**: um token nunca cria, lista ou revoga tokens nem aprova OAuth.

As ferramentas também conferem o escopo antes de executar, devolvendo uma mensagem clara e, para o ChatGPT, `_meta["mcp/www_authenticate"]` com `error="insufficient_scope"` para oferecer nova autorização.

## Tokens pessoais

- Formato `ic_pat_` + 43 caracteres base64url (32 bytes aleatórios). Guardados apenas como SHA-256; o valor completo aparece uma única vez.
- Validade de 7, 30, 90, 180 ou 365 dias, ou sem expiração. Limite de 50 tokens ativos por workspace.
- `lastUsedAt` é atualizado no máximo uma vez por minuto.
- Revogação imediata pela página MCP e CLI.

## OAuth 2.1 (ChatGPT, Claude, Claude Code, Cursor)

Conformidade com a especificação de autorização do MCP (2025-11-25) e com os requisitos documentados por Anthropic e OpenAI:

- `401` em `/mcp` com `WWW-Authenticate: Bearer resource_metadata="{BACKEND_URL}/.well-known/oauth-protected-resource/mcp", scope="read write publish admin"`.
- Protected Resource Metadata (RFC 9728) em `/.well-known/oauth-protected-resource` e `/.well-known/oauth-protected-resource/mcp`; `resource = {BACKEND_URL}/mcp`.
- Authorization Server Metadata (RFC 8414) em `/.well-known/oauth-authorization-server`, com `code_challenge_methods_supported: ["S256"]`, `client_id_metadata_document_supported: true`, `token_endpoint_auth_methods_supported: ["none","client_secret_post","client_secret_basic"]` e `authorization_response_iss_parameter_supported: true` (o parâmetro `iss` é enviado em toda resposta de autorização, inclusive erros).
- Registro dinâmico (RFC 7591) em `POST /oauth/register`, limitado a 30 por hora por IP; registros sem uso são removidos após 7 dias.
- Client ID Metadata Documents: `client_id` HTTPS é buscado com proteção SSRF, 64 KB, 5 s, sem redirecionamentos, cache de 1 hora.
- Redirecionamentos: igualdade exata; para loopback (`http://localhost`, `127.0.0.1`, `[::1]`) a porta é ignorada (RFC 8252, exigido pelo Claude Code). Esquemas privados de apps nativos são aceitos; `javascript:`, `data:`, `file:` etc. não.
- PKCE S256 obrigatório; `resource` (RFC 8707) precisa ser a URL do `/mcp`, e o token fica vinculado a ela.
- Códigos de autorização: 5 minutos, uso único; a reutilização revoga o token emitido com aquele código.
- Access token `ic_oat_` válido por 1 hora; refresh token `ic_ort_` válido por 30 dias, **rotacionado a cada uso** (troca atômica; o refresh antigo deixa de funcionar). Redução de escopo no refresh é permitida; ampliação não.
- Revogação (RFC 7009) em `POST /oauth/revoke` e pela página MCP e CLI.
- O `/token` aceita `application/x-www-form-urlencoded` e JSON. Erros seguem o RFC 6749 (`invalid_grant`, `invalid_client`, `invalid_scope`...).

### Fluxo de consentimento

`GET /oauth/authorize` valida cliente e `redirect_uri` (erros nessa etapa **nunca** redirecionam) e envia o usuário para `{FRONTEND_URL}/oauth/authorize?request=...`, onde o pedido viaja assinado (JWT de 15 minutos com chave derivada de `JWT_SECRET`, que não serve como sessão). A tela mostra o aplicativo, o workspace, o destino do retorno, um aviso para clientes locais (loopback) e as permissões, que podem ser desmarcadas. Se o usuário não estiver logado, a tela leva ao login e volta. A página tem `X-Frame-Options: DENY` e `frame-ancestors 'none'`.

## Ferramentas

O catálogo completo, com parâmetros e escopos, é gerado dos próprios schemas e exibido em **MCP e CLI › Ferramentas** (`GET /api/integrations/catalog`). Categorias:

- **Workspace:** `get_profile`, `get_workspace_overview` (comece por ela), `get_publishing_guide`.
- **Contas e conexões:** `list_accounts`, `get_account`, `sync_account`, `start_account_connection`, `list_pending_accounts`, `select_accounts`, `disconnect_account`.
- **Mídias:** `import_media_from_url`, `upload_media_base64`, `search_instagram_audio` (+ `upload_local_media` na ponte local do CLI).
- **Publicações e calendário:** `list_posts`, `get_post`, `create_post`, `update_post`, `schedule_post`, `unschedule_post`, `publish_post_now`, `duplicate_post`, `delete_post`.
- **IA do workspace:** `generate_ai_content`, `save_daily_plan_as_drafts`.
- **Relatórios:** `get_instagram_analytics` (dashboard, profile_report, growth, engagement, top_posts, posts, audience, best_times, content_types, recommendations, access), `get_network_report` (Facebook e Threads).
- **Comunidade:** `list_comments`, `reply_to_comment`, `delete_comment`.
- **Automações:** `get_automations`, `get_automation_status`, `create_automation_rule`, `update_automation_rule`, `delete_automation_rule`, `create_automation_template`, `delete_automation_template`, `configure_ai_agent`, `subscribe_automation_webhooks`, `send_reviewed_reply`, `get_conversation`, `set_conversation_state`, `forget_conversation`, `sync_threads_automation`.
- **Concorrentes e hashtags:** `list_competitors`, `add_competitor`, `refresh_competitor`, `get_competitor_history`, `remove_competitor`, `search_hashtag`, `list_tracked_hashtags`, `track_hashtag`, `untrack_hashtag`.
- **Notificações e configurações:** `list_notifications`, `mark_notifications_read`, `get_settings`, `update_preferences`, `configure_ai_provider`, `configure_app_credentials`.

Prompts: `planejar_semana`, `publicar_post`, `responder_comentarios`, `relatorio_desempenho`.

Comportamentos importantes:

- **Confirmação explícita:** `publish_post_now`, `delete_post`, `delete_comment`, `disconnect_account` e `delete_automation_rule` exigem `confirm: true`. As instruções do servidor orientam o agente a mostrar o resumo e pedir confirmação antes de agendar ou publicar.
- **Hashtags:** como no compositor, o campo `hashtags` é acrescentado ao fim da legenda ao agendar ou publicar, sem duplicar as que já estão no texto. `get_post` mostra `captionAsPublished`.
- **Datas:** ISO 8601 com fuso explícito (`2026-10-10T18:30:00-03:00`). Fuso padrão do workspace: America/Sao_Paulo.
- **Publicar agora:** o modo `auto` aguarda o resultado de IMAGE e TEXT e coloca vídeos, Reels, Stories e carrosséis na fila (~30 s), evitando o tempo limite dos clientes de IA. Em caso de tempo esgotado, o agente deve consultar `get_post` antes de repetir (a publicação tem trava contra duplicidade).
- **Anotações MCP:** cada ferramenta declara `readOnlyHint`, `destructiveHint`, `idempotentHint` e `openWorldHint`, usadas pelos clientes para pedir aprovação.
- **Perfil no ChatGPT:** `get_profile` tem `_meta["openai/profile"] = true` e devolve o ID estável do usuário.

## Importação de mídia

`POST /api/posts/import-url` (`import_media_from_url`) baixa até 10 URLs em sequência para o armazenamento público de uploads:

- Somente `http`/`https`, portas 80/443/8080/8443, sem credenciais na URL.
- O DNS é validado **no momento da conexão** (dentro do `lookup` do socket), bloqueando loopback, redes privadas, link-local/metadados de nuvem, CGNAT, multicast, endereços reservados e IPv6 equivalentes, inclusive IPv4 mapeado — o que também impede DNS rebinding. Cada redirecionamento (máx. 3) é revalidado.
- Até 100 MB, prazo de 5 minutos, e o tipo é determinado pelos bytes iniciais (JPG, PNG, WebP, GIF, MP4, MOV); HTML, texto, HEIC/AVIF e outros são recusados. A extensão salva vem do tipo detectado — importante porque a publicação reconhece vídeos pela extensão `.mp4/.mov`.
- URLs que já apontam para os uploads do próprio servidor são reaproveitadas.

`upload_media_base64` aceita até 15 MB por arquivo (18 MB no total) com a mesma detecção de tipo. A ponte local do CLI (`upload_local_media`) e `instacommand media upload` também só enviam imagens e vídeos reais; `INSTACOMMAND_MEDIA_DIRS` restringe as pastas permitidas.

## CLI

Instalação e exemplos estão na aba **CLI** da página. Resumo:

```bash
curl -fsSL {BACKEND_URL}/downloads/instacommand.cjs -o ~/.local/bin/instacommand && chmod +x ~/.local/bin/instacommand
instacommand login          # cola um token pessoal (ic_pat_...)
instacommand status
instacommand posts create --account @minhaloja --media foto.jpg --caption "Olá" --hashtags moda --at "2026-10-10 18:30" --schedule
instacommand call get_instagram_analytics report=best_times days=90
instacommand mcp            # ponte stdio para clientes MCP locais
```

- Configuração em `~/.instacommand/config.json` (permissão 0600), com perfis. Variáveis: `INSTACOMMAND_TOKEN`, `INSTACOMMAND_API_URL`, `INSTACOMMAND_PROFILE`, `INSTACOMMAND_CONFIG_DIR`, `INSTACOMMAND_MEDIA_DIRS`.
- Datas sem fuso (`2026-10-10 18:30` ou `10/10/2026 18:30`) usam o fuso do computador.
- Ações irreversíveis exigem `--yes`. Toda saída aceita `--json`.
- O servidor injeta a própria URL no arquivo baixado; a URL só é embutida se contiver apenas caracteres de URL.
- `instacommand mcp` repassa as mensagens JSON-RPC do stdio para o `/mcp` remoto e acrescenta a ferramenta local `upload_local_media`.

## Operação e deploy

- **Banco:** o `Dockerfile` já roda `prisma db push`, que cria `ApiToken`, `OAuthClient`, `OAuthAuthorizationCode`, o enum `ApiTokenKind` e acrescenta `TEXT` ao enum `MediaType` (mudanças apenas aditivas).
- **Variáveis:** nenhuma nova. `BACKEND_URL` precisa ser a URL pública **HTTPS** da API: ela define o issuer OAuth, o recurso `/mcp` e a URL embutida no CLI. `FRONTEND_URL` define a tela de consentimento. `JWT_SECRET` assina os pedidos de consentimento (com chave derivada).
- **Proxy:** `/mcp`, `/oauth/*`, `/.well-known/*` e `/downloads/*` precisam chegar ao backend no mesmo domínio da API (o domínio do backend no Coolify já roteia todos os caminhos). Esses endpoints têm CORS próprio (qualquer origem, sem cookies).
- **Limites:** chamadas internas das ferramentas usam o limite da API por token (300 requisições a cada 15 minutos); `/oauth/token` 120/min por IP; `/oauth/authorize` 60/min por IP.
- **Testes:**
  - Unitários: `cd backend && npm run build && node --test tests/*.test.cjs`; `cd frontend && node --test tests/*.test.cjs`.
  - Ponta a ponta (PostgreSQL real dedicado, nunca produção): `MCP_INTEGRATION_TEST=1 DATABASE_URL=postgresql://.../instacommand_mcp_test node --test tests/mcp-integration.cjs`. Cobre tokens e escopos, o fluxo completo de publicação via MCP com o SDK oficial, OAuth com registro dinâmico e com Client ID Metadata Document, rotação e revogação, a CLI e a ponte stdio.

## Correções feitas junto com esta entrega

- **Segurança (crítico):** o middleware aceitava qualquer JWT assinado com `JWT_SECRET` como sessão, inclusive o `state` do OAuth da Meta/Threads. Esse token deixava `req.user.id` indefinido e o Prisma interpreta `where: { userId: undefined }` como “sem filtro”, expondo dados de todos os workspaces. Agora só payloads de sessão (`id` e `email`, sem `purpose`/`aud`) são aceitos.
- `MediaType` não tinha `TEXT`: criar post só de texto no Threads falhava com erro 500.
- `DELETE /api/scheduler/:id` devolvia qualquer post para rascunho (inclusive publicados) e `POST /api/scheduler/:id/reschedule` podia reagendar um post já publicado. Ambos agora exigem status `SCHEDULED`.
- `GET /api/scheduler/upcoming` listava jobs de todos os workspaces; agora filtra pelos posts do usuário.
- `GET /api/posts/:id` passou a incluir os dados da publicação (link, IDs nas redes).
- **Conexão de contas automática:** antes, toda conta autorizada na Meta era salva inativa e “pendente”, exigindo clicar em “vincular” no InstaCommand, e os dados só apareciam depois de clicar em “Sincronizar” (ou no próximo ciclo do coletor, até 15 minutos). Agora as contas escolhidas na tela da Meta ficam ativas na hora (inclusive ao reconectar uma conta desconectada), a primeira sincronização começa sozinha no callback (`account-sync.service.ts`, sem duplicar com um clique manual), `GET /api/accounts` informa `syncing`, a aba original recebe o aviso pela aba de autorização, atualiza todas as telas e atualiza de novo quando a importação termina, e a aba de autorização se fecha sozinha quando a aba original assumiu. O botão “Sincronizar” também passou a atualizar o cartão e todos os relatórios.
