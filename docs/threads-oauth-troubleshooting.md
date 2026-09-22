# Threads: conexão OAuth e diagnóstico de retorno sem conta conectada

Atualizado em 2026-09-22. Objetivo: explicar o modelo de conexão esperado para o InstaCommand e separar configuração única do produto de uma ação do usuário final. A Meta controla a janela de autorização e a concessão de permissões; não há uma correção local capaz de contornar uma configuração ou aprovação ausente.

## Resposta curta

O cliente final deve clicar em **Entrar com Threads**, entrar na conta Threads e conceder acesso. Ele não deve criar app, copiar token ou preencher credenciais. O InstaCommand, como plataforma, precisa configurar uma única aplicação Meta com o caso de uso **Threads API**, manter as credenciais Threads no backend e concluir as permissões/revisões exigidas para atender usuários que não são testadores do app.

O fluxo oficial usa `https://threads.net/oauth/authorize`, recebe um `code` no callback cadastrado e troca esse código por token no servidor usando o **Threads App ID e Threads App Secret**. O segredo nunca vai para o navegador nem para o cliente. A URL de callback usada na autorização e na troca do código precisa ser idêntica à registrada no app.

## Checklist do proprietário do InstaCommand

1. **Aplicativo correto:** confirme um app Meta com caso de uso Threads API. Use o Threads App ID e o respectivo Threads App Secret. Não presuma que o App ID/Secret de Facebook Login seja intercambiável com as credenciais Threads.
2. **Callback HTTPS exato:** cadastre a URL de callback de produção realmente usada pelo backend. Compare protocolo, host, caminho, barra final e codificação; a URL enviada na autorização e a enviada na troca do `code` têm de coincidir exatamente. Não use localhost nem callback de staging em produção.
3. **Scopes mínimos e apropriados:** `threads_basic` é obrigatório. Solicite `threads_content_publish` para publicar. Solicite scopes de leitura/resposta/insights apenas para funcionalidades implementadas. Para insights, a coleção Meta indica `threads_manage_insights`.
4. **Nível de acesso:** em desenvolvimento, contas fora das funções/testadores do app podem não conseguir autorizar permissões avançadas. Para usuários externos, verifique no painel o acesso e a revisão/publicação exigidos para cada permissão. Uma permissão aparecer na URL `scope` não prova que foi concedida ao token.
5. **Servidor e persistência:** valide que o callback verifica `state` e expiração, trata `error`/cancelamento, troca o `code` uma única vez no backend, persiste token vinculado ao workspace/usuário correto e redireciona de volta para a tela de contas com resultado claro. Não registre `code`, token ou secret.
6. **Várias contas:** permita repetir o OAuth para outras contas e persista cada identidade/conexão separadamente. Não reutilize token de uma conta para outra. Se a sessão Threads do navegador já estiver autenticada, a Meta pode pular a tela de senha; isso não significa que a conexão falhou — o callback e a lista do InstaCommand são a confirmação.

## Diagnóstico por sintoma

| Sintoma | Verificação prioritária | Correção provável |
|---|---|---|
| “URL não permitida” / redirect bloqueado | Callback cadastrado, callback enviado na autorização e callback usado na troca | Corrigir o callback HTTPS exato no app Threads e na configuração do backend |
| OAuth abre em branco, sem callback | Console/rede do navegador, carregamento da própria Meta, `error` no retorno, app/conta em modo de desenvolvimento e configuração do caso de uso | Não repetir autorizações em loop; guardar horário e erro redigido; confirmar app/escopos/callback e retestar uma vez |
| Meta mostra consentimento/conexão prévia, mas InstaCommand volta desconectado | Se houve redirect ao callback; `state`; resultado OAuth; troca do `code`; gravação na base; associação ao workspace; leitura atualizada da UI | Corrigir callback/backend/persistência/cache. A tela de consentimento da Meta, sozinha, não comprova que o backend concluiu a conexão |
| “Conta profissional do Instagram não encontrada” | Este é o fluxo Meta Facebook/Instagram, não o OAuth nativo do Threads; conferir Página, vínculo da conta profissional e ativos/permissões compartilhados | Ajustar a relação Instagram profissional–Página no Meta Business. Não tentar corrigir isso alterando OAuth Threads |
| Funciona para administrador/testador, falha para outro usuário | Modo do app, funções/testadores e nível de acesso/revisão dos scopes | Completar configuração e App Review necessários para acesso de usuários externos |
| Perfil conectado, mas insights retornam 500 | `threads_manage_insights` realmente concedido ao token, validade, métrica e `fbtrace_id` | Tratar como diagnóstico separado do login; seguir `threads-insights-troubleshooting.md` |

## O que os sinais deste caso sugerem

- O modal/tela do Threads dizendo que o usuário já conectou o app comprova que existe uma autorização Meta anterior para aquela identidade; não comprova que a autorização atual terminou com callback aceito, token trocado e conta salva no InstaCommand.
- A volta para `accounts?connected=0&reason=no_professional_instagram` é uma mensagem do fluxo Facebook/Instagram: o backend não encontrou uma conta Instagram profissional na Página/ativos devolvidos pela Meta. Ela não é evidência de erro no OAuth nativo do Threads. Os dois fluxos e suas credenciais precisam ser diagnosticados separadamente.
- Uma página OAuth inteiramente branca pode ser falha de carregamento/JavaScript da Meta, sessão, bloqueio do navegador ou problema de configuração. Um relato comunitário de tela branca não identifica a causa por si só. O teste útil é observar se a Meta enviou o navegador ao callback e qual resultado redigido o backend registrou.
- Não pedir que usuários finais criem apps, obtenham tokens manuais ou forneçam senha. O produto deve esconder essas operações técnicas atrás do botão OAuth.

## Logs seguros necessários para fechar um caso

Registrar apenas: horário UTC; provedor (`threads` ou `facebook_instagram`); etapa (`authorize_start`, `callback_received`, `code_exchange`, `account_persisted`); resultado/HTTP; `error` e `error_subcode` da Meta quando disponíveis; `fbtrace_id`; host/caminho do callback; presença (sim/não) de scopes; e ID interno da conexão/workspace. Redigir query strings e nunca guardar `code`, `access_token`, `app_secret`, cookies ou URL `state` completa.

Critério de sucesso do login Threads: OAuth retorna ao callback correto; `state` válido; code trocado com sucesso no backend; identidade Threads obtida; token associado ao usuário/workspace; conexão aparece após recarregar `/accounts`; novo login de outra conta cria uma segunda conexão sem substituir a primeira.

## Evidência comunitária: usar como pista, não como especificação

- Um tópico Reddit descreve `URL blocked` em app Threads de teste quando o callback não estava permitido/configurado. É coerente com a exigência de callback cadastrado, mas a documentação oficial prevalece: https://www.reddit.com/r/facebook/comments/1elp7qw
- Uma issue no repositório de exemplo da Meta relata erro de convite/tester ao tentar autenticar. Isso ilustra a diferença entre usuários com papel no app e usuários externos; não prova que seja o erro desta conta: https://github.com/fbsamples/threads_api/issues/14
- Uma discussão Stack Overflow relata erros de permissão mesmo com app declarado aprovado. É um alerta de que mensagens/code da API precisam ser inspecionados, não uma solução normativa: https://stackoverflow.com/questions/79895230/meta-threads-api-exchange-access-tokens-in-error

## Fontes primárias

- Coleção oficial Threads da Meta — início, app Threads, autorização e tokens: https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api
- Coleção oficial Meta — autorização e troca do authorization code, exigência do redirect URI correspondente: https://www.postman.com/meta/threads/request/bl7bd9h/exchange-the-code-for-a-token
- Exemplo oficial da Meta no GitHub — usar as credenciais específicas do Threads e cadastrar callback; OAuth requer HTTPS: https://github.com/fbsamples/threads_api
- Coleção oficial Meta — scopes e validação de token: https://www.postman.com/meta/threads/folder/34203612-e0373e84-de6b-46f1-b90d-3fea76ba6782

## Limites desta investigação

Este checklist não altera o painel Meta, não submete permissões a revisão, não revela/transporta segredos e não afirma que o OAuth de produção foi validado para usuários externos. Para concluir a configuração única da plataforma, o app Threads correto precisa fornecer suas credenciais ao backend de produção e o painel Meta precisa mostrar as permissões/acessos necessários. Isso é diferente de pedir credenciais a cada cliente.
