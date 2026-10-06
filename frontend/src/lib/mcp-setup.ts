export type SetupStep = { text: string; code?: string; language?: 'bash' | 'powershell' | 'json' | 'toml' | 'text' }
export type ClientGuide = {
  id: string
  name: string
  auth: 'OAuth' | 'Token' | 'OAuth ou token'
  summary: string
  steps: SetupStep[]
  note?: string
}

export type SetupUrls = { mcpUrl: string; cliUrl: string; apiOrigin: string }

export const TOKEN_PLACEHOLDER = 'SEU_TOKEN_ic_pat'

const json = (value: unknown) => JSON.stringify(value, null, 2)

/** Copy-ready instructions for each MCP client, filled with this server's URLs and, when available, a fresh token. */
export function buildClientGuides({ mcpUrl, cliUrl, apiOrigin }: SetupUrls, token?: string): ClientGuide[] {
  const secret = token || TOKEN_PLACEHOLDER
  const cliPathUnix = '~/.local/bin/instacommand'
  const cliPathWindows = 'C:\\Users\\SEU_USUARIO\\instacommand.cjs'
  return [
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      auth: 'OAuth',
      summary: 'Sem token: você só autoriza o acesso numa tela do InstaCommand.',
      steps: [
        { text: 'No ChatGPT (web), abra Configurações › Aplicativos e conectores › Avançado e ative o Modo desenvolvedor.' },
        { text: 'Clique em Criar, dê o nome “InstaCommand”, cole a URL abaixo e escolha a autenticação OAuth (deixe Client ID e Secret em branco):', code: mcpUrl, language: 'text' },
        { text: 'Clique em Criar, entre no InstaCommand na janela que abrir e clique em Autorizar. Depois é só ativar o InstaCommand no botão “+” da conversa.' },
      ],
      note: 'Requer um plano do ChatGPT com conectores personalizados. Os nomes dos menus podem variar conforme a versão.',
    },
    {
      id: 'claude',
      name: 'Claude (web, desktop e celular)',
      auth: 'OAuth',
      summary: 'Sem token: funciona no site, no app do computador e no celular com a mesma conexão.',
      steps: [
        { text: 'No Claude, abra Configurações › Conectores › Adicionar conector personalizado.' },
        { text: 'Dê o nome “InstaCommand”, cole a URL abaixo e clique em Adicionar:', code: mcpUrl, language: 'text' },
        { text: 'Clique em Conectar, entre no InstaCommand e clique em Autorizar. Depois ative o InstaCommand no menu de ferramentas da conversa.' },
      ],
      note: 'Em organizações, um proprietário pode precisar adicionar o conector antes. Para enviar arquivos do computador, veja “Claude Desktop (local)” em Outras IAs.',
    },
    {
      id: 'claude-code',
      name: 'Claude Code',
      auth: 'OAuth ou token',
      summary: 'Pelo terminal. Use OAuth (recomendado) ou um token pessoal.',
      steps: [
        { text: 'Com OAuth: adicione o servidor e, dentro do Claude Code, rode /mcp, escolha instacommand e Autenticar.', code: `claude mcp add --transport http instacommand ${mcpUrl}`, language: 'bash' },
        { text: 'Ou com token pessoal:', code: `claude mcp add --transport http instacommand ${mcpUrl} --header "Authorization: Bearer ${secret}"`, language: 'bash' },
        { text: 'Para também enviar arquivos locais (ferramenta upload_local_media), use a ponte do CLI (seção “Linha de comando”):', code: `claude mcp add instacommand -e INSTACOMMAND_TOKEN=${secret} -- node ${cliPathUnix} mcp`, language: 'bash' },
      ],
      note: 'Use --scope user para disponibilizar em todos os projetos ou --scope project para compartilhar com a equipe (sem colocar o token no repositório).',
    },
    {
      id: 'claude-desktop-local',
      name: 'Claude Desktop (local)',
      auth: 'Token',
      summary: 'Ponte local via CLI: além de todas as ferramentas, permite enviar fotos e vídeos do seu computador.',
      steps: [
        { text: 'Baixe o CLI (seção “Linha de comando”) e confirme que o Node.js 18 ou mais recente está instalado (node --version).' },
        { text: 'No Claude Desktop, abra Configurações › Desenvolvedor › Editar configuração e acrescente em claude_desktop_config.json (ajuste o caminho do arquivo):', code: json({ mcpServers: { instacommand: { command: 'node', args: [cliPathWindows, 'mcp'], env: { INSTACOMMAND_TOKEN: secret, INSTACOMMAND_API_URL: apiOrigin } } } }), language: 'json' },
        { text: 'No macOS/Linux o caminho fica, por exemplo, "/Users/voce/.local/bin/instacommand". Reinicie o Claude Desktop.' },
      ],
      note: 'Opcional: defina INSTACOMMAND_MEDIA_DIRS no bloco env para limitar as pastas de onde o Claude pode enviar arquivos.',
    },
    {
      id: 'cursor',
      name: 'Cursor',
      auth: 'OAuth ou token',
      summary: 'Arquivo ~/.cursor/mcp.json (global) ou .cursor/mcp.json (projeto).',
      steps: [
        { text: 'Com token pessoal:', code: json({ mcpServers: { instacommand: { url: mcpUrl, headers: { Authorization: `Bearer ${secret}` } } } }), language: 'json' },
        { text: 'Ou apenas com a URL, para o Cursor pedir login via OAuth:', code: json({ mcpServers: { instacommand: { url: mcpUrl } } }), language: 'json' },
      ],
    },
    {
      id: 'vscode',
      name: 'VS Code (Copilot)',
      auth: 'OAuth ou token',
      summary: 'Arquivo .vscode/mcp.json; o token é pedido uma vez e guardado com segurança pelo VS Code.',
      steps: [
        { text: 'Crie .vscode/mcp.json:', code: json({ inputs: [{ type: 'promptString', id: 'instacommand-token', description: 'Token do InstaCommand', password: true }], servers: { instacommand: { type: 'http', url: mcpUrl, headers: { Authorization: 'Bearer ${input:instacommand-token}' } } } }), language: 'json' },
        { text: 'Abra o chat do Copilot no modo Agente e habilite as ferramentas do InstaCommand.' },
      ],
    },
    {
      id: 'codex',
      name: 'OpenAI Codex CLI',
      auth: 'Token',
      summary: 'Arquivo ~/.codex/config.toml usando a ponte local do CLI.',
      steps: [
        { text: 'Acrescente ao ~/.codex/config.toml:', code: `[mcp_servers.instacommand]\ncommand = "node"\nargs = ["${cliPathUnix.replace('~', '/home/voce')}", "mcp"]\nenv = { INSTACOMMAND_TOKEN = "${secret}" }`, language: 'toml' },
      ],
    },
    {
      id: 'gemini',
      name: 'Gemini CLI',
      auth: 'Token',
      summary: 'Arquivo ~/.gemini/settings.json.',
      steps: [
        { text: 'Acrescente em mcpServers:', code: json({ mcpServers: { instacommand: { httpUrl: mcpUrl, headers: { Authorization: `Bearer ${secret}` } } } }), language: 'json' },
      ],
    },
    {
      id: 'other',
      name: 'Outros clientes MCP',
      auth: 'OAuth ou token',
      summary: 'Qualquer cliente compatível com MCP (Streamable HTTP).',
      steps: [
        { text: 'URL do servidor (transporte Streamable HTTP, sem sessão):', code: mcpUrl, language: 'text' },
        { text: 'Autenticação por cabeçalho:', code: `Authorization: Bearer ${secret}`, language: 'text' },
        { text: 'Ou OAuth 2.1 automático: o servidor responde 401 com WWW-Authenticate apontando para os metadados, aceita registro dinâmico (RFC 7591), Client ID Metadata Documents e exige PKCE S256.' },
        { text: 'Clientes só com stdio: use a ponte local.', code: `INSTACOMMAND_TOKEN=${secret} node ${cliPathUnix} mcp`, language: 'bash' },
      ],
    },
  ]
}

export function cliInstallSteps(cliUrl: string) {
  return {
    unix: `mkdir -p ~/.local/bin\ncurl -fsSL ${cliUrl} -o ~/.local/bin/instacommand\nchmod +x ~/.local/bin/instacommand\ninstacommand login`,
    windows: `Invoke-WebRequest ${cliUrl} -OutFile $HOME\\instacommand.cjs\nnode $HOME\\instacommand.cjs login`,
  }
}

export const CLI_EXAMPLES: { title: string; command: string }[] = [
  { title: 'Resumo do workspace e permissões', command: 'instacommand status' },
  { title: 'Contas conectadas (Instagram + Página do Facebook, Threads)', command: 'instacommand accounts' },
  { title: 'Agenda dos próximos 7 dias', command: 'instacommand calendar' },
  { title: 'Rascunho de carrossel com fotos locais', command: 'instacommand posts create --account @minhaloja --media foto1.jpg --media foto2.jpg --caption "Coleção nova" --hashtags moda,verao --at "2026-10-10 18:30"' },
  { title: 'Agendar direto no Instagram e no Facebook', command: 'instacommand posts create --media https://cdn.exemplo.com/video.mp4 --type REEL --platforms instagram,facebook --caption-file legenda.txt --at "2026-10-12 12:00" --schedule' },
  { title: 'Post só de texto no Threads', command: 'instacommand posts create --platforms threads --type TEXT --caption "Bom dia!" --at "2026-10-11 08:00"' },
  { title: 'Agendar / reagendar um rascunho', command: 'instacommand posts schedule <id> --at "15/10/2026 09:00"' },
  { title: 'Publicar agora (exige --yes)', command: 'instacommand posts publish <id> --yes' },
  { title: 'Relatório de 30 dias', command: 'instacommand analytics dashboard --days 30' },
  { title: 'Comentários recentes', command: 'instacommand comments' },
  { title: 'Gerar legenda com a IA do workspace', command: 'instacommand ai caption --topic "promoção de primavera" --tone "divertido"' },
  { title: 'Qualquer ferramenta MCP', command: 'instacommand call get_instagram_analytics report=best_times days=90' },
]

export const PROMPT_EXAMPLES = [
  'Mostre minhas contas conectadas e o que está agendado para esta semana.',
  'Importe esta imagem https://… e crie um rascunho para o Instagram e o Facebook sobre o lançamento de sexta, às 18h. Me mostre antes de agendar.',
  'Planeje 7 posts para a próxima semana com base nos melhores horários dos últimos 90 dias e salve como rascunhos.',
  'Crie um Reel com este vídeo, use uma música em alta da biblioteca do Instagram, marque @parceira como colaboradora e agende para amanhã ao meio-dia.',
  'Responda os comentários sem resposta do último post em tom cordial — me mostre as respostas antes de publicar.',
  'Crie uma automação: quem comentar “EU QUERO” recebe por DM o link do catálogo.',
  'Compare meu desempenho dos últimos 30 dias com o concorrente @exemplo e sugira 5 ações.',
  'Conecte minha conta do Threads.',
]
