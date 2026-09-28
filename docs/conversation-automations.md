# Conversas e automações multicanal

## O que está implementado

- Instagram: mensagens recebidas, respostas públicas a comentários e uma resposta privada por comentário, quando autorizadas pela Meta.
- Facebook: Messenger da Página vinculada à conta profissional. Não atende perfis pessoais nem Páginas independentes sem esse vínculo no cadastro atual.
- Threads: respostas **públicas** a interações nas próprias publicações. Não implementa mensagens privadas.
- Respostas prontas, regras por palavras-chave, agente com base de conhecimento e continuidade opcional das conversas privadas.
- Caixa de conversas, revisão antes do envio, assumir atendimento humano, retomar, interromper e reiniciar contexto.

Regras novas começam pausadas. As regras antigas continuam no Instagram e **não** passam a conversar sem palavra-chave automaticamente. Para continuidade, configure explicitamente uma regra de mensagem por IA com `continueConversation`. Palavras-chave têm prioridade sobre a continuidade e as regras gerais.

## Memória e segurança

- Isolamento por proprietário, conta, rede, pessoa e, em conversas públicas, publicação de origem.
- Contexto limitado a 20 interações, 12 mil caracteres e ao período de 0–30 dias escolhido. Zero desliga o contexto.
- Somente respostas com envio aceito entram no contexto como respostas efetivamente enviadas. Rascunhos não são tratados como falas anteriores do agente.
- Reiniciar memória exclui o contexto anterior das próximas solicitações; não apaga o registro do atendimento. Não equivale a um pedido de exclusão de dados.
- A base de conhecimento fornece contexto ao provedor; não treina um modelo proprietário. O contexto da conversa é enviado ao provedor de IA configurado no servidor.
- Pedidos explícitos para parar ou falar com atendente interrompem o robô. Casos escalados pela IA, mídia sem texto, falhas e limite de respostas também seguem para atendimento humano. A classificação da IA não é infalível.
- Pausar a conversa durante a geração impede o envio ainda não iniciado. Uma solicitação já enviada à Meta não pode ser desfeita pela pausa.
- Ações no painel são registradas; responder manualmente no aplicativo nativo da rede não é, por si só, um comando de pausa do agente. Use **Assumir atendimento**.
- O limite de respostas é por conversa/hora. As mensagens privadas respeitam 24 horas desde a interação recebida; uma resposta privada a comentário exige horário verificável e a janela aplicável de sete dias.
- Redis serializa o processamento por conversa. A chave única do evento impede duplicatas. Erros de resultado incerto não são reenviados automaticamente; precisam de conferência na rede.
- Autorização efetiva é verificada antes do envio. Conta, regra, agente, modo automático, janela e pausa são conferidos novamente após a geração.

## Configuração por canal

Instagram mantém o webhook assinado existente. O callback `/api/webhooks/instagram` também aceita eventos assinados do objeto Page; `/api/webhooks/facebook` é um alias para uma configuração Messenger separada. É necessário inscrever os campos no painel Meta e a Página vinculada. O servidor não presume que uma inscrição aceita signifique entrega real.

Messenger depende de `pages_messaging`, token da Página correta e recebimento de eventos reais. A mesma conexão pode ser usada, mas regras, modelos e agente são separados do Instagram. Esta versão não muda silenciosamente as permissões da configuração de Login para Empresas.

Threads usa `threads_read_replies` e `threads_content_publish`. O botão **Autorizar respostas públicas** acrescenta leitura de respostas apenas nesse fluxo; a conexão comum mantém seus escopos anteriores. Cada conta precisa conceder a permissão e o app precisa do nível de acesso exigido pela Meta. Conexão ou teste de Insights não substituem essa concessão.

O coletor consulta a cada dois minutos as 100 publicações próprias mais recentes dos últimos 30 dias, com até 500 respostas por publicação. Só processa interações posteriores à ativação da regra; avisos mostram quando a consulta foi parcial. IDs, autoria, raiz e horário são verificados. O coletor não segue URLs arbitrárias de paginação. No envio, criar um contêiner não é sucesso: a publicação deve retornar um ID aceito.

Não há disparos por curtidas/novos seguidores, envio em massa ou promessa de DM no Threads. A aprovação pública do app é uma etapa separada da implementação e dos testes locais.

Fontes oficiais: [Instagram Send API](https://www.postman.com/meta/instagram/folder/uxudqu0/send-api), [Messenger Send API](https://www.postman.com/meta/messenger-platform-api/folder/7cc3gd2/send-api), [coleção Threads mantida pela Meta](https://github.com/fbsamples/threads_api/blob/main/postman/threads-api.postman_collection.json).

## Atualização de banco

O startup executa `prisma/upgrades/20260928_conversations.sql` antes de `prisma db push`. A atualização é aditiva, transacional e protegida por advisory lock. Mantém agentes, regras e histórico, converte o escopo antigo para Instagram e deixa continuidade desativada. Não usa `--accept-data-loss`.

Faça backup antes da publicação. Não reverta o esquema executando `db push` com um cliente antigo: o rollback de código deve preservar as colunas novas e dispensar a sincronização destrutiva de um esquema antigo.

## Validação desta entrega — 28/09/2026

- Backend: compilação e 203 testes unitários/rotas aprovados.
- Frontend: compilação de produção e 41 testes aprovados.
- PostgreSQL + Redis isolados: 10 testes aprovados, incluindo memória, separação de canais, duplicatas, recuperação de processamento interrompido, pausa durante a IA, opt-out, revisão humana e isolamento de proprietários.
- Atualização testada contra o esquema anterior com regras ativas e histórico; repetição idempotente também validada.
- Navegador local com dados fictícios: criação de regra pausada, agente, revisão humana, canais separados; celular em 320/390 pixels sem transbordamento horizontal.
- O teste real anterior de uma resposta de IA Instagram (Lowfy → joaouli1) está confirmado. Ele não comprova, sozinho, continuidade em múltiplas mensagens, Messenger ou Threads nesta nova versão.
- Os testes isolados usam transportes sociais/IA controlados. Testes reais dos novos fluxos exigem consentimentos válidos e uma interação real de outra conta; não simule webhook para alegar entrega.

Comandos básicos: `npm run build` e `node --test tests/*.test.cjs` em `backend`; `npm run build` e `node --test tests/*.test.cjs` em `frontend`. Os testes de integração em `backend/tests/conversation-integration.cjs` recusam banco fora do endereço isolado de teste. O roteiro `run-conversation-integration.sh` usa a imagem anterior, o esquema anterior montado em `/checks` e um PostgreSQL/Redis descartáveis, nunca o ambiente de produção.
