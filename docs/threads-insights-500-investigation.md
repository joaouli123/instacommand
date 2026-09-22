# Threads Insights: investigação do HTTP 500 / código 1

## Estado observado

- A autorização Threads funciona: o perfil aparece conectado e a API retorna publicações reais.
- A consulta de insights da conta falha em produção com HTTP 500, código 1 (`An unknown error occurred`).
- A consulta foi reduzida de seis requisições para uma chamada agrupada; após implantação, o erro persistiu. Portanto, a redução de chamadas não resolveu a causa.
- A aplicação pede `threads_manage_insights` no fluxo OAuth, mas isso não prova que o token armazenado recebeu o escopo nem que o aplicativo tem o nível de acesso necessário para todos os usuários.
- No painel Meta revisado em 2026-09-22, `threads_manage_insights` aparecia em solicitações não enviadas. A revisão não foi submetida.

## O que a evidência indica (e o que não indica)

O exemplo oficial da Meta usa `GET /me/threads_insights` em `graph.threads.net`, uma lista de métricas separadas por vírgula e exige verificar no depurador do token se `threads_manage_insights` está concedido e se o token não expirou. A consulta do InstaCommand segue esse formato e solicita `views,likes,replies,reposts,quotes,followers_count`.

Um relato técnico comunitário documentou HTTP 500/código 1 causado por `clicks` enviado ao endpoint de insights de **publicação** (métrica incompatível com esse nível). Isso confirma que código 1 pode ocultar parâmetros inválidos, mas não é a mesma chamada deste aplicativo: aqui é endpoint de **conta**, e a lista atual consta no exemplo oficial da Meta. Relatos comunitários são indícios, não documentação normativa.

Assim, não há evidência para afirmar que reconectar repetidamente, trocar de conta, alterar domínio ou aumentar limite corrigirá este caso. O resultado também não autoriza concluir que a conta foi desconectada.

## Correção e validação necessárias

1. No Meta for Developers, conferir que o produto Threads e o caso de uso de insights estão habilitados para o app correto (Threads App ID, que pode ser diferente do Facebook App ID).
2. Inspecionar o token **sem copiá-lo para logs ou para o navegador**: no Access Token Debugger, validar expiração e a presença de `threads_basic` e `threads_manage_insights`.
3. Se o escopo estiver ausente, corrigir a configuração/revisão do app e então refazer o OAuth uma única vez para emitir token com o escopo. Só mudar a lista pedida no OAuth não concede acesso avançado automaticamente.
4. Se o token possuir ambos os escopos, testar uma métrica de conta documentada por vez (`likes`, sem período) e guardar apenas status/código/subcódigo e `fbtrace_id` redigido de dados pessoais. Em seguida testar a lista agrupada. Isso separa erro de permissão, métrica, período e indisponibilidade interna da Meta.
5. Se uma métrica mínima documentada continuar retornando 500/código 1 com token válido e escopo confirmado, registrar `fbtrace_id`, horário UTC, endpoint e parâmetros não secretos no suporte/bug report da Meta. É um erro do lado Meta ou uma incompatibilidade não exposta claramente; não existe correção local demonstrada até a Meta esclarecer.
6. Revalidar no painel: conexão continua ativa, posts aparecem, métricas indisponíveis são mostradas como indisponíveis (nunca zero inventado), e o erro é explicado sem incentivar reconexões inúteis.

## Fontes

- Meta Threads API no Postman, autorização e verificação de escopos/token: <https://www.postman.com/meta/threads/folder/34203612-e0373e84-de6b-46f1-b90d-3fea76ba6782>
- Meta Threads API no Postman, consulta oficial de insights da conta e parâmetros (`metric` separado por vírgula): <https://www.postman.com/meta/threads/request/4pbwq2u/get-account-insights>
- Relato comunitário ilustrativo de 500 causado por métrica incompatível (insights de publicação; não equivalente à consulta de conta deste app): <https://github.com/mikusnuz/meta-mcp/issues/7>
