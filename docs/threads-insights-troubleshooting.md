# Threads Insights: diagnóstico e correção

Atualizado em 2026-09-25. Evidências de produção abaixo são observações dessa data; não representam aprovação da Meta nem funcionamento completo da integração.

## Causa confirmada da recusa de Insights

- O token armazenado é válido e permite ler perfil/publicações. O debugger retornou apenas `threads_basic` e `threads_content_publish`: falta `threads_manage_insights`.
- `/me/threads_insights?metric=views` retornou HTTP 500/código 1. Com o mesmo token e o ID explícito da conta, `/{threads-user-id}/threads_insights?metric=views` retornou HTTP 500/código 10: aplicação sem permissão para essa ação.
- Portanto, neste caso, HTTP 500 não basta para classificar o problema como indisponibilidade da Meta. O código de erro também precisa ser considerado.
- O debugger identificou o nome do aplicativo, mas não retornou `app_id`; não foi possível afirmar correspondência de ID por essa resposta.
- A configuração efetiva de OAuth Threads não tinha um par completo de credenciais no servidor nem no workspace. O token já salvo continuava permitindo leituras básicas, mas uma nova autorização não podia ser iniciada.

## Correções no código

1. Insights usa o ID explícito da conta. Erros de autorização, expiração e limite de chamadas não geram tentativas individuais repetidas por métrica.
2. Visualizações, curtidas, respostas, repostagens e citações recebem `since` e `until` correspondentes ao período selecionado. Sem esses parâmetros, a documentação define um intervalo padrão curto, não os 7/30/90 dias mostrados no relatório.
3. `followers_count` é consultado separadamente, sem período: representa a contagem atual, não seguidores ganhos no intervalo.
4. Valores em `total_value.value` são aceitos para o período somente quando a requisição foi limitada ao mesmo intervalo. Zero real permanece zero; dado ausente continua indisponível.
5. Falhas parciais preservam as métricas obtidas e as publicações acessíveis. Tokens nunca são incluídos no relatório.
6. OAuth usa somente o par de credenciais do Threads. Não há fallback para o ID/segredo Facebook nem combinação de credenciais de fontes distintas.

## Pendências externas

- Configurar o par `THREADS_APP_ID`/`THREADS_APP_SECRET` do aplicativo Threads correto no serviço API, sem registrar o segredo em código/logs.
- Confirmar o redirect URI e o nível de acesso a `threads_manage_insights`. Reconectar a conta concedendo essa permissão; incluir o escopo no código não altera um token antigo.
- Repetir a consulta real usando o token renovado. Só considerar resolvido quando a Meta devolver a métrica solicitada.
- A aprovação para clientes externos é distinta dos testes com contas/pessoas que têm papel autorizado no app. Não ampliar escopos ou papéis por tentativa.

## Instagram: diagnóstico separado

A falta de Insights do Threads não explica a ausência de DMs do Instagram.

- O fluxo atual do Instagram é Facebook Login com token de Página. Respostas a DMs usam `/{page-id}/messages`; respostas privadas a comentários usam o endpoint distinto `/{ig-user-id}/messages`.
- Antes de enviar uma DM, o backend confere a relação exata entre Página e Instagram. Duplicatas, janela vencida e autorização inválida bloqueiam o envio.
- O callback mantém a validação de assinatura e registra somente contagens após validação. O painel distingue permissões de eventos processados e de envios aceitos pela Meta.
- Nos testes reais anteriores à implantação dessas correções, não havia POST de mensagem identificado nem execução criada. Um teste sintético ou uma inscrição aceita não comprova entrega de evento real.
- Não foi estabelecido que outra integração instalada causava o bloqueio. Nenhuma integração de terceiros foi removida.

## Validação local

Build do backend, build de produção/TypeScript do frontend e 165 testes automatizados passaram. Incluem rotas, assinatura, ausência de conteúdo privado nos logs, bloqueios de envio, destinos distintos de DM/comentário, períodos e classificação de erros. Mocks locais não substituem o teste real Meta → servidor → resposta.

## Fontes oficiais

- [Threads — Insights](https://developers.facebook.com/documentation/threads/insights)
- [Meta, coleção oficial Threads — Account Insights](https://www.postman.com/meta/threads/request/4pbwq2u/get-account-insights)
- [Instagram — Send API](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/send-message)
- [Instagram — Private Replies](https://developers.facebook.com/documentation/instagram-platform/private-replies)
- [Instagram — Webhooks](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/webhooks)
