import { z } from 'zod';

const text = z.string().trim().min(1);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const captionSchema = z.object({
  hook: text.max(500), caption: text.max(2200), cta: text.max(300),
  hashtags: z.array(text.max(80)).max(8),
});
export const weeklyPlanSchema = z.object({
  summary: text.max(2000),
  plan: z.array(z.object({
    day: text.max(50), format: z.enum(['IMAGE', 'CAROUSEL', 'REEL', 'STORY']),
    topic: text.max(300), hook: text.max(500), cta: text.max(300), suggestedTime: time,
  })).length(7).refine(items => new Set(items.map(item => item.day.toLocaleLowerCase('pt-BR'))).size === 7, 'Os sete dias devem ser distintos.'),
});
export const auditSchema = z.object({
  score: z.number().finite().min(0).max(100), summary: text.max(3000),
  strengths: z.array(text.max(1000)).max(8), opportunities: z.array(text.max(1000)).max(8),
  actions: z.array(text.max(1500)).min(1).max(8), bioSuggestion: text.max(500),
  nameSuggestion: text.max(100), positioning: text.max(1500),
  limitations: z.array(text.max(1000)).min(1).max(8),
});
export const replySchema = z.object({
  response: text.max(1000),
  alternatives: z.array(text.max(1000)).length(3)
    .refine(items => new Set(items.map(item => item.toLocaleLowerCase('pt-BR'))).size === 3, 'As alternativas devem ser distintas.'),
});
export const automationReplySchema = z.object({
  response: text.max(1000),
  shouldEscalate: z.boolean(),
  reason: z.string().trim().max(500),
});
export const imageAnalysisSchema = z.object({
  summary: text.max(3000),
  observations: z.array(z.object({ imageIndex: z.number().int().min(1).max(3), evidence: text.max(1000), interpretation: text.max(1500) })).min(1).max(12),
  limitations: z.array(text.max(1000)).min(1).max(8),
  actions: z.array(text.max(1500)).min(1).max(8),
  bioSuggestion: z.string().max(500).optional(),
  nameSuggestion: z.string().max(200).optional(),
  contentIdeas: z.array(text.max(1500)).max(6),
});
export const dailyPlanSchema = z.object({
  summary: text.max(2000),
  timingNote: text.max(1000),
  posts: z.array(z.object({
    topic: text.max(300),
    format: z.enum(['IMAGE', 'CAROUSEL', 'REEL']),
    caption: text.max(2200),
    cta: text.max(300),
    hashtags: z.array(text.max(80)).max(8),
    suggestedTime: time,
    creativeBrief: text.max(2500),
    storyIdea: text.max(1500),
    reason: text.max(1000),
  })).length(3),
});

export function validateAiOutput(mode: string, result: unknown) {
  if (mode === 'caption') return captionSchema.parse(result);
  if (mode === 'plan') return weeklyPlanSchema.parse(result);
  if (mode === 'audit') return auditSchema.parse(result);
  if (mode === 'reply') return replySchema.parse(result);
  if (mode === 'automation-reply') return automationReplySchema.parse(result);
  if (mode === 'daily') return dailyPlanSchema.parse(result);
  if (mode === 'image-analysis') return imageAnalysisSchema.parse(result);
  throw new Error('Modo de IA não suportado.');
}
