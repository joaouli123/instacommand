# Preparação para SaaS multiusuário

O InstaCommand agora possui a base necessária para onboarding público:

- `POST /api/auth/register` cria uma conta com e-mail, nome e senha.
- `POST /api/auth/login` autentica somente o usuário informado; não existe mais usuário ou senha padrão.
- O login cria uma sessão segura em cookie e também retorna o token para o frontend.
- O OAuth da Meta e do Threads usa um `state` assinado, com validade de 10 minutos, para vincular o retorno ao usuário que iniciou a conexão.
- Contas Instagram, Threads, posts, agendamentos, analytics e credenciais ficam filtrados pelo `userId`.
- Uma conta Instagram ou Threads já vinculada a um usuário não pode ser tomada por outro usuário.

## Para abrir ao público

1. Use um único App da Meta aprovado para produção e mantenha `META_APP_ID`, `META_APP_SECRET`, `FB_LOGIN_CONFIG_ID` e os callbacks no Coolify.
2. Solicite na Meta as permissões necessárias para publicação e leitura. Em modo de desenvolvimento, adicione cada conta de teste como tester do app.
3. Mantenha `COOKIE_SECURE=true`, `JWT_SECRET` e `ENCRYPTION_KEY` fortes e diferentes entre ambientes.
4. Configure o domínio público da API em `BACKEND_URL`, `FB_REDIRECT_URI`, `THREADS_REDIRECT_URI` e `NEXT_PUBLIC_BACKEND_URL`.
5. Configure `FRONTEND_URL` e `CORS_ORIGINS` com o domínio oficial do painel, sem usar `*`.

## Próximas camadas comerciais

A separação de dados já está preparada para adicionar planos, cobrança e limites por workspace. Antes de vender acesso, ainda é recomendado incluir verificação de e-mail, recuperação de senha, termos/privacidade, cobrança e observabilidade por cliente.
