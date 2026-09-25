# Deploy no Coolify

O `docker-compose.yml` agora sobe a aplicação completa: PostgreSQL, Redis, API e frontend. O frontend deve receber o domínio público da API no build, porque variáveis `NEXT_PUBLIC_*` são incorporadas pelo Next.js durante a compilação.

## Configuração recomendada

No Coolify, crie um recurso Docker Compose apontando para este repositório e para a branch `master`. Configure os domínios:

- `frontend`: domínio principal do InstaCommand, por exemplo `https://instacommand.seudominio.com`.
- `backend`: domínio da API, por exemplo `https://api-instacommand.seudominio.com`.

Defina estas variáveis no ambiente do recurso:

```env
DB_USER=instacommand
DB_PASSWORD=uma-senha-forte
DB_NAME=instacommand
DATABASE_URL=postgresql://instacommand:uma-senha-forte@postgres:5432/instacommand?schema=public
REDIS_URL=redis://redis:6379

JWT_SECRET=uma-chave-aleatoria-com-mais-de-32-caracteres
ENCRYPTION_KEY=outra-chave-aleatoria-com-mais-de-32-caracteres

META_APP_ID=seu_app_id
META_APP_SECRET=seu_app_secret
META_GRAPH_API_VERSION=v25.0
FB_LOGIN_CONFIG_ID=2156831831569762
# Fallback only when FB_LOGIN_CONFIG_ID is empty; match the authorized Meta login configuration.
FB_OAUTH_SCOPES=business_management,instagram_basic,instagram_content_publish,instagram_manage_comments,instagram_manage_messages,pages_manage_metadata,pages_messaging,pages_read_engagement,pages_show_list
FB_REDIRECT_URI=https://api-instacommand.seudominio.com/api/auth/facebook/callback
THREADS_APP_ID=identificador_do_app_do_threads
THREADS_APP_SECRET=segredo_do_app_do_threads
THREADS_REDIRECT_URI=https://api-instacommand.seudominio.com/api/auth/threads/callback

BACKEND_URL=https://api-instacommand.seudominio.com
FRONTEND_URL=https://instacommand.seudominio.com
NEXT_PUBLIC_BACKEND_URL=https://api-instacommand.seudominio.com
CORS_ORIGINS=https://instacommand.seudominio.com
COOKIE_SECURE=true

MEDIA_PUBLIC_URL=https://api-instacommand.seudominio.com/uploads
WEBHOOK_VERIFY_TOKEN=um-token-aleatorio-longo-e-secreto

# Assistente de conteúdo (opcional; mantenha a chave somente no backend)
GEMINI_API_KEY=sua_chave_do_provedor_de_ia
GEMINI_MODEL=gemini-2.5-flash
# Alternativa OpenAI-compatible:
# AI_API_KEY=sua_chave
# AI_BASE_URL=https://api.openai.com/v1
# AI_MODEL=gpt-4o-mini
```

Mantenha os volumes `postgres_data`, `redis_data` e `uploads_data`. Eles preservam o banco, a fila e as mídias entre deploys.

## Meta for Developers

No app da Meta, cadastre exatamente:

```text
https://api-instacommand.seudominio.com/api/auth/facebook/callback
```

Na configuração do Login do Facebook para Empresas do InstaCommand, selecione os ativos Páginas e Contas do Instagram e estas permissões: `business_management`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_messages`, `pages_manage_metadata`, `pages_read_engagement` e `pages_show_list`. Para a assinatura de mensagens da Página, habilite também o caso de uso Messenger e `pages_messaging`, mediante autorização do responsável: essa permissão permite gerenciar conversas da Página no Messenger. A configuração dedicada atual tem ID `2156831831569762`; o `FB_LOGIN_CONFIG_ID` deve apontar para ela. Os escopos do Login para Empresas vêm da configuração no painel Meta; `FB_OAUTH_SCOPES` só é usado quando `FB_LOGIN_CONFIG_ID` está vazio.

O pedido de acesso avançado da Meta e a configuração OAuth são etapas distintas: adicionar os escopos à configuração não aprova o uso por clientes. `instagram_manage_comments`, `instagram_manage_messages` e `pages_manage_metadata` precisam do acesso Meta adequado antes de as automações receberem eventos de clientes. Depois da aprovação, cada pessoa precisa reconectar a conta para conceder os novos escopos. `threads_basic` e `threads_manage_insights` pertencem ao OAuth independente do Threads, não a essa configuração Facebook Login.

O botão “Conectar nova conta” faz o fluxo completo: abre a autorização da Meta, busca as páginas vinculadas, encontra as contas Instagram Business/Creator, salva os tokens criptografados e retorna para `/accounts` já conectado.

A tela **Comunidade** lê comentários reais das publicações e permite responder, excluir e pedir sugestões de resposta à IA. Esse recurso depende da aprovação de `instagram_manage_comments`; quando a Meta ainda não liberou a permissão, a plataforma informa o motivo e não cria dados fictícios.

### Automações de comentários e mensagens

Em **Automações**, cada workspace pode criar regras por comentário ou mensagem recebida, com correspondência por palavra-chave e respostas prontas. Para habilitar eventos, configure no produto Webhooks do Meta for Developers o callback `https://<domínio-da-api>/api/webhooks/instagram`, o mesmo `WEBHOOK_VERIFY_TOKEN` do servidor e os campos `comments` e `messages`. O backend verifica `X-Hub-Signature-256`, enfileira eventos no Redis e ignora duplicatas. A conta deve então ser inscrita na aba Automações. Testes com acesso padrão são restritos a pessoas/contas autorizadas pelo papel no app; para clientes externos, é necessário o acesso avançado aprovado pela Meta. Em ambos os casos, confira os escopos efetivamente concedidos, `pages_manage_metadata`, a inscrição da Página vinculada e o recebimento real dos eventos. Permissão ou inscrição aceita não confirma entrega. Curtidas e novos seguidores não são gatilhos suportados pela API oficial e não devem ser prometidos.

O agente de IA usa tom, instruções e uma base de conhecimento por conta. As respostas geradas ficam em revisão humana por padrão; envio automático exige ativação explícita e ainda passa por uma triagem de escalonamento. Curtidas e novos seguidores não são gatilhos implementados, pois não são eventos oferecidos ao app por este fluxo de API. Respostas privadas a comentários e conversas por DM seguem as janelas e limites definidos pela Meta.

A inscrição da Página mantém `feed` e acrescenta `messages` somente quando `instagram_manage_messages` e `pages_messaging` foram efetivamente concedidas. A assinatura do objeto Instagram no app continua necessária. Habilitar Messenger ou salvar a configuração de login não atualiza tokens existentes: reconecte a conta e confira os escopos concedidos antes de repetir a inscrição. Não confunda uma inscrição aceita com uma mensagem real recebida e respondida.

## Healthchecks

- API: `/health`
- API alternativa: `/api/health`
- Frontend: `/`

Depois do deploy, valide primeiro a API e então o frontend. Se o callback da Meta retornar erro, confira se o domínio, `FB_REDIRECT_URI` e as permissões do app são idênticos aos cadastrados no Meta Developers.

## Configuração pelo painel

Depois de entrar no InstaCommand, abra `Configurações > Conexão com a Meta`. O App ID, App Secret e Client Token podem ser salvos pela interface. O App Secret e o Client Token são criptografados no backend e nunca são devolvidos para o navegador em texto aberto; quando já estiverem configurados, deixe os campos secretos vazios para mantê-los.

O botão `Entrar com a Meta` em `Contas conectadas` usa automaticamente as credenciais salvas para iniciar o OAuth. Para desenvolvimento local, cadastre `http://localhost:3001/api/auth/facebook/callback` no campo de callback do Meta Developers. Para produção, substitua pelo callback do domínio público da API.

## Assistente de conteúdo com IA

Com uma chave de IA configurada no backend, o compositor pode gerar legendas, CTAs, hashtags e planos editoriais de 7 dias. A tela de contas também pode analisar bio, posicionamento, pontos fortes e próximas ações usando os dados reais disponíveis da conta. Usuários finais não precisam conhecer nem inserir a chave do provedor.
