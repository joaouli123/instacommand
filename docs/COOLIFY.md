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
FB_LOGIN_CONFIG_ID=identificador_da_configuracao_do_login_para_empresas
FB_REDIRECT_URI=https://api-instacommand.seudominio.com/api/auth/facebook/callback

BACKEND_URL=https://api-instacommand.seudominio.com
FRONTEND_URL=https://instacommand.seudominio.com
NEXT_PUBLIC_BACKEND_URL=https://api-instacommand.seudominio.com
CORS_ORIGINS=https://instacommand.seudominio.com
COOKIE_SECURE=true

MEDIA_PUBLIC_URL=https://api-instacommand.seudominio.com/uploads
WEBHOOK_VERIFY_TOKEN=um-token-aleatorio
```

Mantenha os volumes `postgres_data`, `redis_data` e `uploads_data`. Eles preservam o banco, a fila e as mídias entre deploys.

## Meta for Developers

No app da Meta, cadastre exatamente:

```text
https://api-instacommand.seudominio.com/api/auth/facebook/callback
```

Na configuração do Login do Facebook para Empresas, selecione os ativos Páginas e Contas do Instagram e as permissões `business_management`, `instagram_basic`, `instagram_content_publish`, `pages_show_list` e `pages_read_engagement`. O `FB_LOGIN_CONFIG_ID` deve ser o identificador dessa configuração; ele é usado no OAuth para que a Meta aplique essas permissões ao login.

O botão “Conectar nova conta” faz o fluxo completo: abre a autorização da Meta, busca as páginas vinculadas, encontra as contas Instagram Business/Creator, salva os tokens criptografados e retorna para `/accounts` já conectado.

## Healthchecks

- API: `/health`
- API alternativa: `/api/health`
- Frontend: `/`

Depois do deploy, valide primeiro a API e então o frontend. Se o callback da Meta retornar erro, confira se o domínio, `FB_REDIRECT_URI` e as permissões do app são idênticos aos cadastrados no Meta Developers.

## Configuração pelo painel

Depois de entrar no InstaCommand, abra `Configurações > Conexão com a Meta`. O App ID, App Secret e Client Token podem ser salvos pela interface. O App Secret e o Client Token são criptografados no backend e nunca são devolvidos para o navegador em texto aberto; quando já estiverem configurados, deixe os campos secretos vazios para mantê-los.

O botão `Entrar com a Meta` em `Contas conectadas` usa automaticamente as credenciais salvas para iniciar o OAuth. Para desenvolvimento local, cadastre `http://localhost:3001/api/auth/facebook/callback` no campo de callback do Meta Developers. Para produção, substitua pelo callback do domínio público da API.
