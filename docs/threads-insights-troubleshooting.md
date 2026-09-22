# Threads Insights: investigação e plano de correção

Atualizado em 2026-09-22. Este documento separa fatos reproduzidos, configuração necessária e hipóteses para o HTTP 500 da API de Insights do Threads. Não afirma que o problema externo foi resolvido.

## Sintoma reproduzido

- Em produção, a autenticação Threads e a leitura do perfil/publicações funcionam; o relatório lista 21 publicações.
- `GET /me/threads_insights` retorna HTTP 500 com erro Meta código 1; trocar para a rota versionada `/v1.0` não resolveu.
- A consulta de métricas agrupadas, alinhada ao formato da coleção oficial da Meta, também falhou. Logo, apenas reduzir a quantidade de chamadas ou separar as métricas não é correção comprovada.
- O token não foi inspecionado via debugger durante esta investigação. Portanto ainda não sabemos se contém `threads_manage_insights`, se expirou, nem o nível de acesso efetivo.

## Fatos sobre autorização e app

1. A coleção oficial Threads da Meta documenta `GET /{threads-user-id}/threads_insights` (também `/me/threads_insights`), exige métrica(s) e mostra métricas de conta em uma lista separada por vírgulas. O exemplo usa `views,likes,replies,reposts,quotes,followers_count,follower_demographics`.
2. A própria orientação de autorização da coleção manda verificar no Access Token Debugger a presença de `threads_basic` e `threads_manage_insights`, além da validade do token.
3. O aplicativo Threads tem credenciais próprias. O catálogo oficial de onboarding da Meta diz para criar app Meta com o caso de uso Threads e usar o Client ID do app Threads. O ID da aplicação Facebook/Instagram não deve ser usado como fallback para Threads.
4. O backend antes permitia esse fallback. A correção local remove o fallback e escolhe o par de credenciais Threads (`THREADS_APP_ID` + `THREADS_APP_SECRET`) ou o par Threads explicitamente salvo pelo usuário. Testes asseguram que o ID genérico/Facebook nunca vira client ID Threads.
5. Na configuração Coolify examinada anteriormente não constava `THREADS_APP_ID`; sem esse par de ambiente, novos clientes SaaS sem credenciais próprias não conseguem iniciar OAuth Threads. Isso é uma pendência de configuração de produção, não prova da causa do HTTP 500 na conta já conectada.

## Relatos técnicos (não são especificação)

- Uma issue de implementação relata HTTP 500/code 1 quando o cliente envia a métrica não suportada `clicks` em insights de post; a correção reportada foi remover essa métrica. É um alerta para testar métricas individualmente, mas refere-se a outro endpoint/caso, não demonstra a causa do nosso erro em insights de conta: https://github.com/mikusnuz/meta-mcp/issues/7
- Um relato independente de sondagem de API observou HTTP 500/code 10 em insights sem a permissão e HTTP 500/code 1 para combinações que o autor considerou inválidas. Isso reforça que 500 não identifica sozinho a causa e que é necessário verificar scopes e reduzir a consulta a uma métrica conhecida. É evidência anedótica, não documentação oficial: https://www.picklog.cc/blog/threads-api-rate-limit
- Também há relatos recentes de endpoints Threads que respondem 500/code 1 a campos/métricas incompatíveis. Não se deve concluir “falta de permissão” somente pelo status 500.

## Procedimento seguro para fechar o diagnóstico

1. No Meta Access Token Debugger, inspecionar o token Threads sem copiar seu valor para tickets/logs. Registrar apenas `is_valid`, expiração, `app_id`, identidade de usuário e lista de scopes. Confirmar `threads_basic` e `threads_manage_insights`.
2. Se `threads_manage_insights` estiver ausente: o backend precisa solicitar consentimento Threads atualizado; o usuário deve reconectar e conceder a permissão. Se o app ainda não tem acesso adequado a essa permissão, um administrador da Meta precisa concluir a configuração/revisão do produto. Não pedir `instagram_manage_insights` para resolver Insights do Threads: são APIs e permissões diferentes.
3. Confirmar que `app_id` do token é exatamente o app Threads configurado e que o Redirect URI cadastrado na Meta coincide caractere por caractere com o callback usado pelo servidor.
4. Com autorização válida, testar sem mutações: `GET /me?fields=id,username`, depois `/me/threads_insights?metric=views` isoladamente; se falhar, testar uma métrica documentada por chamada (`likes`, `replies`, `reposts`, `quotes`, `followers_count`). Incluir `breakdown` apenas ao pedir `follower_demographics`. Manter request-id/trace e corpo de erro redigido; nunca registrar token.
5. Se a métrica única continuar em 500/code 1 com token válido e scope confirmado, salvar horário UTC, versão/host, endpoint e request-id; abrir caso no Meta Developer Support. Evitar loops de reconexão/retry, que não alteram scopes e podem gerar rate limiting.
6. Configurar no serviço API do Coolify o par secreto `THREADS_APP_ID`/`THREADS_APP_SECRET` vindo do app Threads correto, redeployar e testar OAuth com um perfil de teste autorizado. Não reutilizar nem colar secrets em código, issues ou logs.

## Estado das correções locais

- Corrigido: seleção de credenciais de OAuth Threads não faz fallback ao app Facebook/Meta genérico; callback agora devolve razões legíveis e não expõe erros OAuth detalhados.
- Testado: testes unitários garantem seleção do par de credenciais correto e cobertura da ausência de credenciais Threads.
- Ainda pendente: validar os scopes reais do token atualmente conectado; provisionar o par Threads no Coolify; obter aprovação/nível de acesso Meta conforme necessário; repetir a consulta real de Insights depois da reautorização. Não enviar nova permissão para revisão nem ampliar acesso sem confirmação específica.
- HTTP 500 continua sem causa única comprovada até concluir os passos 1–4. Nenhuma mudança no painel da Meta foi feita nesta investigação.

## Fontes

- Meta, coleção oficial Threads — Account Insights: https://www.postman.com/meta/threads/request/4pbwq2u/get-account-insights
- Meta, coleção oficial Threads — Authorization e validação de token/scopes: https://www.postman.com/meta/threads/folder/34203612-e0373e84-de6b-46f1-b90d-3fea76ba6782
- Meta, coleção oficial Threads — documentação e onboarding: https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api
- Issue comunitária sobre 500 causado por métricas/campos não suportados: https://github.com/mikusnuz/meta-mcp/issues/7
- Sondagem comunitária dos códigos 500 e scopes: https://www.picklog.cc/blog/threads-api-rate-limit
