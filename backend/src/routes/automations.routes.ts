import { Router } from 'express';
import { AutomationTemplateType, SocialAutomationReplyMode, SocialAutomationTrigger } from '@prisma/client';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  createAutomation, deleteAutomation, deleteAutomationTemplate, getAutomationStatus,
  getAutomationWorkspace, saveAgentSettings, saveAutomationTemplate, sendReviewedAutomationReply,
  subscribeInstagramAccountToWebhooks, updateAutomation,
  getAutomationConversation, setConversationState, clearConversationMemory,
} from '../services/automation.service';
import { syncThreadsAutomation } from '../services/threads-automation.service';

const router = Router();
router.use(authenticate);
const platformSchema = z.enum(['INSTAGRAM', 'FACEBOOK', 'THREADS']);
const scopeSchema = z.object({ accountId: z.string().uuid(), platform: platformSchema.default('INSTAGRAM') });

const ruleSchema = z.object({
  accountId: z.string().uuid(), name: z.string().trim().min(2).max(100),
  platform: platformSchema.optional(), continueConversation: z.boolean().optional(),
  trigger: z.nativeEnum(SocialAutomationTrigger), keywords: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  replyMode: z.nativeEnum(SocialAutomationReplyMode).default('TEMPLATE'),
  publicCommentReply: z.string().trim().max(1000).nullish(),
  privateCommentReply: z.string().trim().max(1000).nullish(),
  directMessageReply: z.string().trim().max(1000).nullish(),
  enabled: z.boolean().default(false),
});
const templateSchema = z.object({
  accountId: z.string().uuid(), name: z.string().trim().min(2).max(100),
  platform: platformSchema.optional(),
  type: z.nativeEnum(AutomationTemplateType), content: z.string().trim().min(1).max(1000),
});
const agentSchema = z.object({
  accountId: z.string().uuid(), enabled: z.boolean(), autoSend: z.boolean(),
  platform: platformSchema.optional(), memoryDays: z.number().int().min(0).max(30).optional(),
  maxRepliesPerHour: z.number().int().min(1).max(30).optional(),
  tone: z.string().trim().min(2).max(200), instructions: z.string().trim().max(2000),
  knowledgeBase: z.string().trim().max(8000), fallback: z.string().trim().min(1).max(1000),
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { accountId, platform } = scopeSchema.parse(req.query);
    res.json(await getAutomationWorkspace(req.user!.id, accountId, platform));
  } catch (error) { next(error); }
});

router.get('/status', async (req: AuthRequest, res, next) => {
  try {
    const { accountId, platform } = scopeSchema.parse(req.query);
    res.json(await getAutomationStatus(req.user!.id, accountId, false, platform));
  } catch (error) { next(error); }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try { res.status(201).json(await createAutomation(req.user!.id, ruleSchema.parse(req.body))); }
  catch (error) { next(error); }
});

// Keep named endpoints before /:id so "agent" is not parsed as a rule ID.
router.put('/agent', async (req: AuthRequest, res, next) => {
  try { res.json(await saveAgentSettings(req.user!.id, agentSchema.parse(req.body))); }
  catch (error) { next(error); }
});

router.put('/:id', async (req: AuthRequest, res, next) => {
  try { res.json(await updateAutomation(req.user!.id, req.params.id, ruleSchema.parse(req.body))); }
  catch (error) { next(error); }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { accountId, platform } = scopeSchema.parse(req.query);
    await deleteAutomation(req.user!.id, accountId, req.params.id, platform);
    res.sendStatus(204);
  } catch (error) { next(error); }
});

router.post('/templates', async (req: AuthRequest, res, next) => {
  try { res.status(201).json(await saveAutomationTemplate(req.user!.id, templateSchema.parse(req.body))); }
  catch (error) { next(error); }
});

router.delete('/templates/:id', async (req: AuthRequest, res, next) => {
  try {
    const { accountId, platform } = scopeSchema.parse(req.query);
    await deleteAutomationTemplate(req.user!.id, accountId, req.params.id, platform);
    res.sendStatus(204);
  } catch (error) { next(error); }
});

router.post('/subscribe', async (req: AuthRequest, res, next) => {
  try {
    const input = scopeSchema.parse(req.body);
    res.json(await subscribeInstagramAccountToWebhooks(req.user!.id, input.accountId, input.platform));
  } catch (error) { next(error); }
});

router.post('/executions/:id/send', async (req: AuthRequest, res, next) => {
  try {
    const input = scopeSchema.extend({ message: z.string().trim().min(1).max(1000) }).parse(req.body);
    res.json(await sendReviewedAutomationReply(req.user!.id, input.accountId, req.params.id, input.message, input.platform));
  } catch (error) { next(error); }
});

router.get('/conversations/:id', async (req: AuthRequest, res, next) => {
  try {
    const input = scopeSchema.parse(req.query);
    res.json(await getAutomationConversation(req.user!.id, input.accountId, req.params.id, input.platform));
  } catch (error) { next(error); }
});
router.put('/conversations/:id/state', async (req: AuthRequest, res, next) => {
  try {
    const input = scopeSchema.extend({ state: z.enum(['BOT', 'HUMAN', 'STOPPED']), consentConfirmed: z.boolean().default(false) }).parse(req.body);
    res.json(await setConversationState(req.user!.id, input.accountId, req.params.id, input.state, input.platform, input.consentConfirmed));
  } catch (error) { next(error); }
});
router.post('/conversations/:id/forget', async (req: AuthRequest, res, next) => {
  try {
    const input = scopeSchema.parse(req.body);
    res.json(await clearConversationMemory(req.user!.id, input.accountId, req.params.id, input.platform));
  } catch (error) { next(error); }
});
router.post('/threads/sync', async (req: AuthRequest, res, next) => {
  try {
    const input = scopeSchema.parse(req.body);
    res.json(await syncThreadsAutomation(req.user!.id, input.accountId));
  } catch (error) { next(error); }
});

export default router;
