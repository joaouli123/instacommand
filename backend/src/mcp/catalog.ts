import { z, type ZodTypeAny } from 'zod';
import { TOOL_CATEGORIES, type ToolDefinition } from './tool-kit';
import { workspaceTools } from './tools/workspace';
import { accountTools } from './tools/accounts';
import { mediaTools } from './tools/media';
import { postTools } from './tools/posts';
import { aiTools } from './tools/ai';
import { analyticsTools } from './tools/analytics';
import { communityTools } from './tools/community';
import { automationTools } from './tools/automations';
import { researchTools } from './tools/research';
import { settingsTools } from './tools/settings';

export const MCP_TOOLS: ToolDefinition[] = [
  ...workspaceTools,
  ...accountTools,
  ...mediaTools,
  ...postTools,
  ...aiTools,
  ...analyticsTools,
  ...communityTools,
  ...automationTools,
  ...researchTools,
  ...settingsTools,
];

/** Tools that only exist in the local CLI bridge (`instacommand mcp`), listed for documentation. */
export const LOCAL_BRIDGE_TOOLS = [{
  name: 'upload_local_media',
  title: 'Enviar arquivos locais',
  category: 'media',
  description: 'Somente no modo local (instacommand mcp): envia imagens e vídeos do computador do usuário e devolve as URLs para mediaUrls.',
  scopes: ['write'],
  params: [{ name: 'paths', required: true, description: 'Caminhos dos arquivos locais (até 10).' }],
}];

const unwrap = (schema: ZodTypeAny): { inner: ZodTypeAny; required: boolean } => {
  let current = schema;
  let required = true;
  for (;;) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) { required = required && current instanceof z.ZodNullable; current = current.unwrap(); continue; }
    if (current instanceof z.ZodDefault) { required = false; current = current._def.innerType; continue; }
    if (current instanceof z.ZodEffects) { current = current.innerType(); continue; }
    return { inner: current, required };
  }
};

const typeLabel = (schema: ZodTypeAny): string => {
  if (schema instanceof z.ZodString) return 'texto';
  if (schema instanceof z.ZodNumber) return 'número';
  if (schema instanceof z.ZodBoolean) return 'sim/não';
  if (schema instanceof z.ZodLiteral) return JSON.stringify(schema.value);
  if (schema instanceof z.ZodEnum) return (schema.options as string[]).join(' | ');
  if (schema instanceof z.ZodUnion) return (schema.options as ZodTypeAny[]).map((option) => typeLabel(unwrap(option).inner)).join(' | ');
  if (schema instanceof z.ZodArray) return `lista de ${typeLabel(unwrap(schema.element).inner)}`;
  if (schema instanceof z.ZodObject) return 'objeto';
  return 'valor';
};

/** Serializable summary for the "MCP e CLI" page. Derived from the live schemas, so it never drifts. */
export const toolCatalog = () => ({
  categories: TOOL_CATEGORIES,
  tools: [
    ...MCP_TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      category: tool.category,
      description: tool.description,
      scopes: tool.scopes,
      annotations: tool.annotations,
      requiresConfirmation: 'confirm' in tool.inputSchema,
      params: Object.entries(tool.inputSchema).map(([name, schema]) => {
        const { inner, required } = unwrap(schema as ZodTypeAny);
        return { name, required, type: typeLabel(inner), description: (schema as ZodTypeAny).description ?? inner.description ?? null };
      }),
      localOnly: false,
    })),
    ...LOCAL_BRIDGE_TOOLS.map((tool) => ({ ...tool, annotations: null, requiresConfirmation: false, params: tool.params.map((param) => ({ ...param, type: 'lista de texto' })), localOnly: true })),
  ],
});
