# YouTube: configuração do app no Google Cloud

O UX Code Social publica e agenda vídeos e Shorts pela YouTube Data API v3. Cada
cliente conecta o próprio canal com "Entrar com o Google"; ninguém precisa criar
app ou copiar token. O administrador configura o app uma vez.

## 1. Projeto e API

1. Em https://console.cloud.google.com crie um projeto (ex.: `UX Code Social`).
2. Em **APIs e serviços → Biblioteca**, ative **YouTube Data API v3**.

## 2. Tela de consentimento OAuth

1. Tipo de usuário **Externo**; nome do app, e-mail de suporte, logo, domínio
   `uxcode.com.br`, links da política de privacidade e dos termos.
2. Escopos (somente estes dois):
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube.readonly`
3. Enquanto o app estiver em **Teste**, só os usuários de teste cadastrados
   conseguem conectar (até 100). Para abrir a todos, envie para **verificação**
   (são escopos sensíveis: pede vídeo demonstrando o uso e domínio verificado).

## 3. Credencial

1. **Credenciais → Criar credencial → ID do cliente OAuth → Aplicativo da Web**.
2. URI de redirecionamento autorizado:
   `https://<BACKEND_URL>/api/auth/youtube/callback`
3. Cadastre no Coolify (backend):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# opcional; o padrão é BACKEND_URL + /api/auth/youtube/callback
YOUTUBE_REDIRECT_URI=
```

## 4. Auditoria da API do YouTube (obrigatória para vídeos públicos)

Projetos criados depois de julho de 2020 que não passaram pela auditoria têm
**todo vídeo enviado travado como privado**. O sistema detecta isso e avisa no
resultado da publicação. Para liberar, preencha o formulário de auditoria
("YouTube API Services - Audit and Quota Extension Form") descrevendo o uso:
publicação e agendamento de vídeos pelo próprio dono do canal.

## 5. Cota

A cota padrão é de 10.000 unidades por dia por projeto; cada envio de vídeo
custa cerca de 1.600 (≈ 6 vídeos/dia para todos os clientes somados). Peça
aumento no mesmo formulário da auditoria. Quando a cota acaba, a publicação
falha com uma mensagem clara e volta a funcionar à meia-noite do horário do
Pacífico.

## O que a integração faz e não faz

- Vertical ou quadrado (até 3 min) vira Short; horizontal vira vídeo comum.
- Título obrigatório; a legenda vira a descrição; visibilidade, público
  (feito para crianças, obrigatório), categoria e conteúdo alterado/sintético.
- Miniatura personalizada opcional (exige canal verificado por telefone; se o
  YouTube recusar, o vídeo é publicado e o sistema avisa).
- Excluir o post no UX Code Social **não** apaga o vídeo do canal: a conexão
  pede só permissão de envio, para manter a verificação do Google simples.
