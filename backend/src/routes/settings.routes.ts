import { Router } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getMetaCredentialStatus, saveMetaCredentials, getThreadsCredentialStatus, saveThreadsCredentials } from '../services/instagram/auth.service';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

const metaCredentialsSchema = z.object({
  appId: z.string().trim().min(1, 'Informe o App ID').max(100),
  appSecret: z.string().trim().max(200).optional(),
  clientToken: z.string().trim().max(200).optional(),
});

const threadsCredentialsSchema = z.object({
  appId: z.string().trim().min(1, 'Informe o App ID do Threads').max(100),
  appSecret: z.string().trim().max(200).optional(),
});

const preferencesSchema = z.object({
  dataRefreshFrequency: z.enum(['15m', '1h', '24h']),
  weeklyReport: z.boolean(),
  engagementAlerts: z.boolean(),
  publishFailureAlerts: z.boolean(),
});

router.use(authenticate);

router.get('/preferences', async (req: AuthRequest, res, next) => {
  try {
    const preferences = await prisma.userPreference.upsert({
      where: { userId: req.user!.id },
      update: {},
      create: { userId: req.user!.id },
    });
    res.json(preferences);
  } catch (error) {
    next(error);
  }
});

router.put('/preferences', async (req: AuthRequest, res, next) => {
  try {
    const values = preferencesSchema.parse(req.body);
    const preferences = await prisma.userPreference.upsert({
      where: { userId: req.user!.id },
      update: values,
      create: { userId: req.user!.id, ...values },
    });
    res.json(preferences);
  } catch (error) {
    next(error);
  }
});

router.get('/meta', async (req: AuthRequest, res, next) => {
  try {
    const status = await getMetaCredentialStatus(req.user!.id);
    res.json(status);
  } catch (error) {
    next(error);
  }
});

router.put('/meta', async (req: AuthRequest, res, next) => {
  try {
    const values = metaCredentialsSchema.parse(req.body);
    const status = await saveMetaCredentials(req.user!.id, values);
    res.json({ message: 'Credenciais da Meta salvas com segurança', ...status });
  } catch (error) {
    next(error);
  }
});

router.get('/threads', async (req: AuthRequest, res, next) => {
  try {
    const status = await getThreadsCredentialStatus(req.user!.id);
    res.json(status);
  } catch (error) {
    next(error);
  }
});

router.put('/threads', async (req: AuthRequest, res, next) => {
  try {
    const values = threadsCredentialsSchema.parse(req.body);
    const status = await saveThreadsCredentials(req.user!.id, values);
    res.json({ message: 'Credenciais do Threads salvas com segurança', ...status });
  } catch (error) {
    next(error);
  }
});

export default router;
