import { z } from 'zod';

const text = z.string().trim().min(1);
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
  return result;
}
