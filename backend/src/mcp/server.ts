import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { API_SCOPE_DETAILS, type ApiScope } from '../services/api-scopes';
import { protectedResourceMetadataUrl } from '../config/mcp';
import { AppError } from '../utils/errors';
import { ApiCallError } from './internal-api';
import { MCP_TOOLS } from './catalog';
import { DEFAULT_TIMEZONE, isPlainObject, type ToolContext, type ToolDefinition } from './tool-kit';

export const MCP_SERVER_VERSION = '1.0.0';

export const MCP_INSTRUCTIONS = `Você está conectado ao InstaCommand, plataforma de gestão de Instagram, Facebook (Página vinculada a cada conta do Instagram) e Threads.

Fluxo recomendado:
1. Comece com get_workspace_overview: ele traz os IDs das contas (accountId e threadsAccountId), as permissões deste token e o fuso padrão (${DEFAULT_TIMEZONE}).
2. Mídias: as redes baixam os arquivos de URLs públicas. Use import_media_from_url (link direto do arquivo) ou upload_media_base64 e use somente as URLs devolvidas em mediaUrls. Nunca invente URLs.
3. Crie como rascunho (create_post com status DRAFT). Mostre ao usuário as redes, o formato, a legenda final (captionAsPublished), as mídias e a data/hora, e só então agende (schedule_post) ou publique (publish_post_now com confirm=true) depois da confirmação explícita dele.
4. Datas sempre em ISO 8601 com fuso explícito, ex.: 2026-10-10T18:30:00-03:00.
5. Regras de formatos e limites: get_publishing_guide.

Segurança:
- Publicar, agendar, excluir, responder ou excluir comentários, enviar mensagens, ativar automações e desconectar contas exigem confirmação explícita do usuário na conversa.
- Conectar contas exige que o usuário abra no navegador o link gerado por start_account_connection.
- Se uma publicação falhar ou expirar, consulte get_post antes de tentar de novo: nunca repita uma operação de resultado incerto.
- Os erros trazem a mensagem do servidor; explique-a ao usuário em vez de contornar a validação.`;

const insufficientScopeResult = (missing: ApiScope[]) => {
  const labels = missing.map((scope) => `"${scope}" (${API_SCOPE_DETAILS[scope].label})`).join(' e ');
  return {
    isError: true,
    content: [{ type: 'text' as const, text: `Esta conexão não tem a permissão ${labels} necessária para esta ferramenta. Peça ao usuário para reconectar o InstaCommand concedendo essa permissão (ou criar um token com ela na página MCP e CLI).` }],
    // ChatGPT reads this to offer re-authorization with the missing scope.
    _meta: { 'mcp/www_authenticate': [`Bearer resource_metadata="${protectedResourceMetadataUrl()}", error="insufficient_scope", scope="${missing.join(' ')}", error_description="Permissão ${missing.join(', ')} necessária"`] },
  };
};

const errorResult = (error: unknown) => {
  let message = 'Erro inesperado ao executar a ferramenta.';
  if (error instanceof ApiCallError) message = `${error.message} (HTTP ${error.status})`;
  else if (error instanceof AppError) message = error.message;
  else if (error instanceof Error && error.name === 'TimeoutError') message = 'A operação demorou demais e o tempo limite expirou. Ela pode ter sido concluída: confira o estado (por exemplo com get_post) antes de repetir.';
  else console.error('MCP tool failed unexpectedly:', error);
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
};

const successResult = (value: unknown) => {
  const structured = isPlainObject(value) ? value : { result: value ?? null };
  return { content: [{ type: 'text' as const, text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
};

export async function runTool(tool: ToolDefinition, args: any, context: ToolContext) {
  const required = tool.scopesFor ? tool.scopesFor(args) : tool.scopes;
  const missing = required.filter((scope) => !context.auth.scopes.includes(scope));
  if (missing.length) return insufficientScopeResult(missing);
  try {
    return successResult(await tool.handler(args, context));
  } catch (error) {
    return errorResult(error);
  }
}

/** A new server per request: the transport is stateless and every request carries its own token. */
export function createMcpServer(context: ToolContext) {
  const server = new McpServer(
    { name: 'instacommand', title: 'InstaCommand', version: MCP_SERVER_VERSION },
    { instructions: MCP_INSTRUCTIONS, capabilities: { tools: {}, prompts: {} } },
  );

  for (const tool of MCP_TOOLS) {
    server.registerTool(tool.name, {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: { title: tool.title, ...tool.annotations },
      ...(tool.meta ? { _meta: tool.meta } : {}),
    }, ((args: any) => runTool(tool, args, context)) as any);
  }

  server.registerPrompt('planejar_semana', {
    title: 'Planejar a semana de conteúdo',
    description: 'Monta e salva como rascunhos um plano de publicações para os próximos 7 dias.',
    argsSchema: { tema: z.string().optional().describe('Tema ou campanha da semana'), conta: z.string().optional().describe('@usuário da conta, se houver várias') },
  }, ({ tema, conta }) => ({
    messages: [{ role: 'user', content: { type: 'text', text: `Use o InstaCommand para planejar minha próxima semana de conteúdo${conta ? ` da conta @${conta}` : ''}${tema ? ` com o tema "${tema}"` : ''}. Comece com get_workspace_overview e get_instagram_analytics (best_times e content_types), proponha 1 post por dia com formato, horário, legenda e hashtags, e só crie os rascunhos (create_post DRAFT) depois que eu aprovar. Não agende nada sem minha confirmação.` } }],
  }));

  server.registerPrompt('publicar_post', {
    title: 'Criar e publicar um post',
    description: 'Guia o fluxo completo: mídia, legenda, revisão, agendamento ou publicação.',
    argsSchema: { briefing: z.string().describe('O que o post deve comunicar'), midia: z.string().optional().describe('URL da imagem ou vídeo') },
  }, ({ briefing, midia }) => ({
    messages: [{ role: 'user', content: { type: 'text', text: `Quero criar um post no InstaCommand sobre: ${briefing}.${midia ? ` Use esta mídia: ${midia}.` : ''} Importe a mídia, escreva a legenda e as hashtags, crie como rascunho e me mostre o resumo final (redes, formato, legenda como será publicada e horário). Pergunte se devo agendar ou publicar agora.` } }],
  }));

  server.registerPrompt('responder_comentarios', {
    title: 'Responder comentários',
    description: 'Lê os comentários recentes e sugere respostas para aprovação.',
    argsSchema: { tom: z.string().optional().describe('Tom das respostas') },
  }, ({ tom }) => ({
    messages: [{ role: 'user', content: { type: 'text', text: `Leia os comentários recentes das minhas publicações no InstaCommand (list_comments), agrupe os que precisam de resposta e sugira respostas${tom ? ` em tom ${tom}` : ''}. Só publique cada resposta (reply_to_comment) depois que eu aprovar.` } }],
  }));

  server.registerPrompt('relatorio_desempenho', {
    title: 'Relatório de desempenho',
    description: 'Resume o desempenho das redes no período e recomenda próximos passos.',
    argsSchema: { dias: z.string().optional().describe('Período: 7, 30 ou 90') },
  }, ({ dias }) => ({
    messages: [{ role: 'user', content: { type: 'text', text: `Gere um relatório de desempenho dos últimos ${dias || '30'} dias com os dados reais do InstaCommand: get_instagram_analytics (dashboard, top_posts, best_times, content_types) e get_network_report para Facebook e Threads quando conectados. Destaque o que funcionou, o que não funcionou e 5 ações concretas. Não invente métricas indisponíveis.` } }],
  }));

  return server;
}
