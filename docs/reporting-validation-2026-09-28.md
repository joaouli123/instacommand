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
