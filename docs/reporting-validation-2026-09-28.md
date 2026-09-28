# Relatórios e responsividade — 28/09/2026

## Entrega

- Instagram, Facebook e Threads: controles compactos, gráficos/tabelas, seleção de métricas, agrupamento diário/semanal/mensal, zoom por faixa e exportação CSV.
- Datas de publicação agrupadas em America/Sao_Paulo. Métricas de fluxo são somadas; snapshots de seguidores/alcance mantêm a última observação. Lacunas não viram zero e curvas não interpolam observações ausentes.
- Listagens pesquisáveis e paginadas para Facebook/Threads; publicações do Instagram em cards móveis e tabela desktop. Demografia com nomes legíveis e valores consultáveis.
- Navegação inferior até tablet, cabeçalho e seletor limitados ao espaço disponível, diálogos com altura máxima, calendário em lista, compositor e automações mais compactos.
- Tendências não quebra quando curtidas/comentários/taxa estão ausentes. Dashboard diferencia falha de consulta, ausência de dados e zero real.
- Facebook preserva posts quando contadores opcionais não têm permissão; Threads preserva páginas já recebidas em caso de falha posterior. Instagram isola métricas incompatíveis sem multiplicar chamadas em erros de autenticação ou limite.

## Validação local

- Backend: build e 222 testes aprovados.
- Frontend: build e 51 testes aprovados.
- Navegador: 320, 390, 768 e 1440 px; filtros, agrupamentos, paginação, dados tabulares, exportação CSV e zoom por arraste. O download `instagram-perfil-day.csv` foi inspecionado com cabeçalhos/datas/valores corretos.
- O servidor `tests/fixtures/report-api.cjs` é exclusivamente local, sintético, sem credenciais e sem transporte social. Esses testes validam interface e cálculos; não comprovam concessões ou dados reais da Meta.
- Cenário nulo de Tendências foi reproduzido sem exceção. Avisos de hidratação locais identificam atributos injetados por extensões do navegador, não uma falha de consulta da aplicação.

## Limites observados em produção antes da entrega

- O token Instagram consultado não possuía `instagram_manage_insights`; o serviço real recusou a consulta com erro de permissão. Sem essa concessão não é possível atestar alcance, visualizações e demografia reais.
- A Página não possuía `read_insights` nem `pages_read_user_content`. A consulta básica de publicações funcionou; a inclusão de contadores de comentários/reações foi recusada. A última permissão inclui acesso ao conteúdo de usuários da Página e capacidade de excluir comentários; não a conceder sem aprovação específica.
- A configuração Facebook Login for Business controla os escopos efetivos quando `FB_LOGIN_CONFIG_ID` está presente. Alterar apenas a variável de fallback não amplia essa configuração.
- Acrescentar permissões exige consentimento do responsável e reconexão. A aprovação de acesso avançado da Meta para clientes é um requisito separado. Nenhuma permissão foi concedida implicitamente nesta entrega.
- O relatório real do Threads retornou métricas e publicações. Não se distribuem totais artificialmente entre dias quando o provedor não retorna a série.
- Nenhum histórico anterior à conexão pode ser reconstruído como se tivesse sido observado; a interface informa as limitações.

## Evidências

Capturas locais privadas em `artifacts/responsive-audit-2026-09-28/`. As capturas 01–16 documentam o estado anterior; as de número 20 em diante são cenários sintéticos locais. A confirmação do deploy e os testes pós-publicação são registrados separadamente no diário privado da sessão.

## Ampliação e validação das métricas após consentimento

- As três permissões de diagnóstico foram especificamente autorizadas pelo proprietário, adicionadas à configuração existente e verificadas no token após a reconexão. A sincronização real completou sem ampliar contas ou ativar respostas gerais.
- Instagram: o resumo consulta explicitamente o período, em vez de apresentar o snapshot recente como total. Exibe alcance único, visualizações, contas engajadas, total de interações informado pela rede e seus contadores disponíveis. Frequência = visualizações/alcance; taxa do perfil = contas engajadas/alcance. Os contadores acumulados das publicações ficam separados.
- Novos seguidores e saídas vêm de `follows_and_unfollows`, com `breakdown=follow_type`. Saldo só é calculado quando ambos os valores existem. Alcance diário usa `metric_type=time_series`, sem substituir o total único do período pela soma diária.
- A consulta de totais do Instagram aceita até 30 dias. Seleções de 90/365/730 dias preservam a lista e o histórico de publicações, mas identificam visivelmente o resumo do perfil como últimos 30 dias. Não há reconstrução fictícia de históricos anteriores à coleta.
- Cache de totais por conta/revisão/período por até cinco minutos, com deduplicação simultânea, invalidação após sincronização/reconexão e nova tentativa mais curta quando nenhum dado é retornado. Autenticação e propriedade são verificadas antes de acessar o cache.
- Demografia do público engajado usa `this_month` (30 dias móveis) nas versões atuais. Um retorno vazio permanece indisponível, inclusive quando a permissão está correta. A divisão demográfica cobre apenas o público retornado em cada dimensão, não necessariamente todos os seguidores.
- Facebook: adicionadas séries de visualizadores únicos diários, total de seguidores e entradas/saídas diárias. Contagens únicas não são somadas entre dias; agrupamentos semanais/mensais mostram a última observação diária e identificam essa regra. Visualizações continuam aditivas, sem duplicatas, datas inválidas ou pontos fora da janela.
- A janela de Insights do Facebook é de no máximo 90 dias; períodos maiores mantêm a consulta de posts e mostram explicitamente o limite das séries de audiência. Cobertura incompleta de visualizações recebe indicação de soma parcial.
- Eixos de contagem usam inteiros, preservando o primeiro e último dia legível. Cards, legendas, seletores, tabelas e gráficos foram conferidos em 320/390/1440 px; controles de período e agrupamento foram exercitados com cenários locais, separados dos testes reais.
- Validação: backend build e **235 testes**; frontend build e **57 testes**. Fontes oficiais conferidas: [Instagram User Insights](https://developers.facebook.com/documentation/instagram-platform/api-reference/instagram-user/insights) e [Page Insights](https://developers.facebook.com/docs/graph-api/reference/insights/).
- Acesso de contas próprias não equivale a aprovação pública do aplicativo. Não se inventam métricas que a Meta não retorna, dados demográficos sem cobertura ou Stories expirados antes de serem coletados.
