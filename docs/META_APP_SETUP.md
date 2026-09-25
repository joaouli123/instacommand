# Configuração do Meta App (Facebook/Instagram)

Este guia explica como configurar o app no Meta for Developers para conectar com a Instagram Graph API.

## Passo 1: Criar o App

1. Acesse [developers.facebook.com](https://developers.facebook.com/)
2. Clique em **"Criar App"**
3. Selecione o tipo **"Business"**
4. Preencha:
   - Nome: `InstaCommand` (ou o nome que preferir)
   - Email de contato
   - Business Account (opcional para testes)

## Passo 2: Adicionar Produtos

No painel do app, adicione os seguintes produtos:

### Facebook Login for Business
1. Clique em **"Configurar"** no card do Facebook Login
2. Em **Settings**, configure:
   - **Valid OAuth Redirect URIs**: `http://localhost:3001/api/auth/facebook/callback`
   - **Deauthorize Callback URL**: `http://localhost:3001/api/auth/deauthorize`
3. Salve as alterações

### Instagram Graph API
1. Adicione o produto **Instagram Graph API**
2. As permissões serão configuradas no App Review

## Passo 3: Configurar Permissões

Para funcionamento completo, você precisará solicitar estas permissões via **App Review**:

| Permissão | Uso |
|-----------|-----|
| `instagram_basic` | Ler perfil e mídia |
| `instagram_content_publish` | Publicar posts |
| `instagram_manage_insights` | Acessar métricas e analytics |
| `instagram_manage_comments` | Gerenciar comentários |
| `instagram_manage_messages` | Ler e responder mensagens recebidas da conta profissional |
| `pages_show_list` | Listar páginas do Facebook |
| `pages_read_engagement` | Ler dados da página |
| `pages_manage_posts` | Publicar e gerenciar posts da Página |

> **Nota**: Para desenvolvimento/teste, você pode usar permissões em modo de teste
> sem App Review, mas apenas com contas de teste (administradores do app).

## Passo 4: Copiar Credenciais

1. No painel do app, vá em **Settings > Basic**
2. Copie:
   - **App ID** → Cole em `META_APP_ID` no seu `.env`
   - **App Secret** → Cole em `META_APP_SECRET` no seu `.env`

## Passo 5: Configurar Webhooks para automações

1. No painel do app, vá em **Webhooks**
2. Selecione **Instagram** 
3. Configure:
   - **Callback URL**: `https://sua-api.com/api/webhooks/instagram`
   - **Verify Token**: O mesmo valor de `WEBHOOK_VERIFY_TOKEN` no seu `.env`
4. Assine os campos `comments` e `messages` do produto Instagram.
5. Configure `META_APP_SECRET` e `WEBHOOK_VERIFY_TOKEN` no backend; a assinatura HMAC é validada antes de aceitar os eventos.
6. Depois do App Review e da autorização da conta, abra **Automações** e conecte os eventos daquela conta.

As automações recebem comentários e mensagens que chegam pelo webhook. Mensagens diretas só podem continuar dentro da janela/regras da Meta; a resposta privada de comentário é limitada pela Meta e não abre uma conversa irrestrita. Curtidas e novos seguidores não são oferecidos como gatilho. O envio pela IA vem desligado por padrão e casos sinalizados como incertos ficam para revisão humana.

> Webhooks exigem HTTPS. Para desenvolvimento local, use ferramentas como
> [ngrok](https://ngrok.com/) para criar um túnel seguro.

## Passo 6: Vincular Contas Instagram

Suas contas Instagram **DEVEM** ser do tipo **Business** ou **Creator**:

1. No app Instagram, vá em **Configurações > Conta > Mudar para conta profissional**
2. Selecione **Business** ou **Creator**
3. Vincule a uma **Página do Facebook**
4. Pronto! A conta agora pode ser acessada via API

## Diagrama do Fluxo OAuth

```
Usuário                  InstaCommand              Facebook             Instagram
  │                          │                        │                     │
  │── Clica "Entrar" ──────►│                        │                     │
  │                          │── Redirect OAuth ────►│                     │
  │                          │                        │── Login + Permissões│
  │                          │◄── Code ──────────────│                     │
  │                          │── Troca Code ────────►│                     │
  │                          │◄── Access Token ──────│                     │
  │                          │── GET /me/accounts ──►│                     │
  │                          │◄── Pages + IG IDs ────│                     │
  │                          │── GET /insights ──────────────────────────►│
  │                          │◄── Dados do perfil ──────────────────────── │
  │◄── Dashboard pronto ────│                        │                     │
```

## Limites Importantes

- **Modo de Teste**: Apenas admins/testers do app podem usar
- **App Review**: Necessário para acesso público (produção)
- **Business Verification**: Pode ser necessária para certas permissões
- **Contas Pessoais**: NÃO são suportadas (apenas Business/Creator)
