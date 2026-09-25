import { Router } from 'express';
import { AutomationTemplateType, SocialAutomationReplyMode, SocialAutomationTrigger } from '@prisma/client';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  createAutomation, deleteAutomation, deleteAutomationTemplate, getAutomationStatus,
  getAutomationWorkspace, saveAgentSettings, saveAutomationTemplate, sendReviewedAutomationReply,
  subscribeInstagramAccountToWebhooks, updateAutomation,
} from '../services/automation.service';

const router = Router();
router.use(authenticate);

const ruleSchema = z.object({
  accountId: z.string().uuid(), name: z.string().trim().min(2).max(100),
  trigger: z.nativeEnum(SocialAutomationTrigger), keywords: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  replyMode: z.nativeEnum(SocialAutomationReplyMode).default('TEMPLATE'),
  publicCommentReply: z.string().trim().max(1000).optional(),
  privateCommentReply: z.string().trim().max(1000).optional(),
  directMessageReply: z.string().trim().max(1000).optional(),
  enabled: z.boolean().default(false),
});
const templateSchema = z.object({
  accountId: z.string().uuid(), name: z.string().trim().min(2).max(100),
  type: z.nativeEnum(AutomationTemplateType), content: z.string().trim().min(1).max(1000),
});
const agentSchema = z.object({
  accountId: z.string().uuid(), enabled: z.boolean(), autoSend: z.boolean(),
  tone: z.string().trim().min(2).max(200), instructions: z.string().trim().max(2000),
  knowledgeBase: z.string().trim().max(8000), fallback: z.string().trim().min(1).max(1000),
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const accountId = String(req.query.accountId || '');
    if (!accountId) return res.status(400).json({ error: 'Selecione uma conta do Instagram.' });
    res.json(await getAutomationWorkspace(req.user!.id, accountId));
  } catch (error) { next(error); }
});

router.get('/status', async (req: AuthRequest, res, next) => {
  try {
    const accountId = String(req.query.accountId || '');
    if (!accountId) return res.status(400).json({ error: 'Selecione uma conta do Instagram.' });
    res.json(await getAutomationStatus(req.user!.id, accountId));
  } catch (error) { next(error); }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try { res.status(201).json(await createAutomation(req.user!.id, ruleSchema.parse(req.body))); }
  catch (error) { next(error); }
});

router.put('/:id', async (req: AuthRequest, res, next) => {
  try { res.json(await updateAutomation(req.user!.id, req.params.id, ruleSchema.parse(req.body))); }
  catch (error) { next(error); }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const accountId = String(req.query.accountId || '');
    if (!accountId) return res.status(400).json({ error: 'Selecione uma conta do Instagram.' });
    await deleteAutomation(req.user!.id, accountId, req.params.id);
    res.sendStatus(204);
  } catch (error) { next(error); }
});

router.post('/templates', async (req: AuthRequest, res, next) => {
  try { res.status(201).json(await saveAutomationTemplate(req.user!.id, templateSchema.parse(req.body))); }
  catch (error) { next(error); }
});

router.delete('/templates/:id', async (req: AuthRequest, res, next) => {
  try {
    const accountId = String(req.query.accountId || '');
    if (!accountId) return res.status(400).json({ error: 'Selecione uma conta do Instagram.' });
    await deleteAutomationTemplate(req.user!.id, accountId, req.params.id);
    res.sendStatus(204);
  } catch (error) { next(error); }
});

router.put('/agent', async (req: AuthRequest, res, next) => {
  try { res.json(await saveAgentSettings(req.user!.id, agentSchema.parse(req.body))); }
  catch (error) { next(error); }
});

router.post('/subscribe', async (req: AuthRequest, res, next) => {
  try {
    const input = z.object({ accountId: z.string().uuid() }).parse(req.body);
    res.json(await subscribeInstagramAccountToWebhooks(req.user!.id, input.accountId));
  } catch (error) { next(error); }
});

router.post('/executions/:id/send', async (req: AuthRequest, res, next) => {
  try {
    const input = z.object({ accountId: z.string().uuid(), message: z.string().trim().min(1).max(1000) }).parse(req.body);
    res.json(await sendReviewedAutomationReply(req.user!.id, input.accountId, req.params.id, input.message));
  } catch (error) { next(error); }
});

export default router;
