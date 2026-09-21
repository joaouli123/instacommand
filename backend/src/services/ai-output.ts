import { z } from 'zod';

const text = z.string().trim().min(1);
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
    suggestedTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    creativeBrief: text.max(2500),
    storyIdea: text.max(1500),
    reason: text.max(1000),
  })).length(3),
});

export function validateAiOutput(mode: string, result: unknown) {
  if (mode === 'daily') return dailyPlanSchema.parse(result);
  if (mode === 'image-analysis') return imageAnalysisSchema.parse(result);
  return result;
}
