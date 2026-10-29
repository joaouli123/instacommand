# Configurar o app do TikTok

O código do UX Code Social já está pronto para conectar perfis do TikTok, publicar vídeos (Direct Post) e ler as métricas. Falta criar o app no TikTok for Developers e cadastrar as duas credenciais no servidor. Enquanto isso não é feito, o TikTok aparece como "Conexão em configuração".

## 1. Criar a conta de desenvolvedor e o app

1. Acesse https://developers.tiktok.com/ e entre (ou crie a conta de desenvolvedor) com o e-mail da empresa.
2. Em **Manage apps**, clique em **Connect an app** e crie o app:
   - **Nome:** UX Code Social
   - **Categoria:** Business / Social media management
   - **Ícone:** o mesmo usado no Google e na Meta
3. Em **Basic information**:
   - **Website URL:** `https://uxgram.com.br`
   - **Terms of Service URL:** `https://uxgram.com.br/termos-de-servico`
   - **Privacy Policy URL:** `https://uxgram.com.br/politica-de-privacidade`
   - **Platforms:** Web

## 2. Produtos e permissões

1. Adicione os produtos **Login Kit** e **Content Posting API**.
2. Em **Content Posting API**, ative **Direct Post**.
3. Em **Login Kit → Redirect URI**, cadastre exatamente:
   `https://api-instacommand.179.198.98.63.sslip.io/api/auth/tiktok/callback`
4. Em **Scopes**, marque os escopos abaixo. Eles são exatamente os que o sistema pede; nenhum além deles:
   - `user.info.basic`
   - `user.info.profile`
   - `user.info.stats`
   - `video.list`
   - `video.publish`

## 3. Testar antes da auditoria (Sandbox)

1. Crie um **Sandbox** no app e adicione o seu perfil do TikTok como **Target user**.
2. Enquanto o app não for auditado, o TikTok impõe três limites:
   - só aceita publicações com privacidade **"Só eu"**;
   - o perfil do TikTok precisa estar em **modo privado** no aplicativo na hora da publicação;
   - no máximo 5 perfis podem publicar a cada 24 horas.
3. Para publicar de forma pública, envie o app para a **auditoria do Direct Post**. A tela de publicação do UX Code Social já segue todas as regras exigidas pelo TikTok:
   - mostra o nome do perfil e busca os dados dele toda vez que é aberta;
   - a privacidade não vem pré-selecionada;
   - Comentários, Dueto e Costura vêm desmarcados;
   - tem a divulgação de conteúdo comercial, com Sua marca e Conteúdo de marca;
   - tem a confirmação da Declaração de Uso de Música;
   - mostra a prévia antes de publicar e o status do envio depois.

## 4. Cadastrar as credenciais no Coolify

No app **instacommand-api**, em Environment Variables, crie as duas variáveis abaixo e clique em **Redeploy**:

- `TIKTOK_CLIENT_KEY`: o **Client key** do app
- `TIKTOK_CLIENT_SECRET`: o **Client secret** do app

Depois disso, conecte o perfil:

1. Em **Contas**, selecione a empresa no topo.
2. Clique em **Conectar nova conta → TikTok** e autorize. O perfil fica vinculado à empresa selecionada.

## O que funciona após a conexão

- **Editor de posts:** TikTok como destino de vídeos, com prévia no estilo "Para você" e todas as opções exigidas pelo TikTok.
- **Agendamento:** o vídeo é enviado no horário marcado e o resultado aparece com o link do post.
- **Analytics → TikTok:**
  - números do perfil: seguidores, curtidas e vídeos;
  - vídeos do período, com visualizações, curtidas, comentários e compartilhamentos;
  - exportação em CSV.
- **Dashboard:** card do TikTok em "Todas as redes da empresa".
- **MCP e CLI:** criar e agendar posts no TikTok, ver as opções do perfil (`get_tiktok_creator_info`) e o relatório.

## Limitações da API do TikTok

- **Apagar vídeos:** a API não permite. Ao excluir o post no UX Code Social, o sistema avisa para apagar o vídeo no aplicativo.
- **Comentários:** ainda não existe uma API pública para ler e responder comentários de forma geral. Por isso, o TikTok não aparece em Comunidade nem em Automações.
- **Concorrentes e tendências:** dependem da Research API, que exige uma aprovação separada do TikTok.
