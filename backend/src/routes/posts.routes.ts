import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { PrismaClient, MediaType, PostStatus } from '@prisma/client';
import { schedulePost, cancelScheduledPost } from '../services/scheduler.service';
import { publishPost, deletePost } from '../services/instagram/publish.service';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { env } from '../config/env';

const router = Router();
const prisma = new PrismaClient();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.resolve(process.cwd(), process.env.MEDIA_UPLOAD_DIR || './uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) return cb(null, true);
    return cb(new Error('Apenas imagens e vídeos são aceitos.'));
  },
});

router.use(authenticate);

router.post('/', async (req: any, res, next) => {
  try {
    const { accountId, threadsAccountId, mediaType, mediaUrls, caption, hashtags, platforms, scheduledFor, status } = req.body;
    const normalizedPlatforms = Array.isArray(platforms) && platforms.length ? platforms : ['INSTAGRAM'];
    const unsupportedPlatform = normalizedPlatforms.find((platform: unknown) => !['INSTAGRAM', 'FACEBOOK', 'THREADS'].includes(String(platform)));
    if (unsupportedPlatform) return res.status(400).json({ error: `Plataforma não suportada: ${unsupportedPlatform}` });
    const account = await prisma.instagramAccount.findFirst({ where: { id: accountId, userId: req.user.id, isActive: true } });
    if (!account) return res.status(400).json({ error: 'Selecione uma conta do Instagram conectada.' });
    const threadsAccount = threadsAccountId
      ? await prisma.threadsAccount.findFirst({ where: { id: threadsAccountId, userId: req.user.id, isActive: true } })
      : null;
    if (normalizedPlatforms.includes('THREADS') && !threadsAccount) {
      return res.status(400).json({ error: 'Conecte uma conta do Threads antes de selecionar essa plataforma.' });
    }
    if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) {
      return res.status(400).json({ error: 'Envie pelo menos uma mídia.' });
    }
    if (!['IMAGE', 'CAROUSEL', 'REEL', 'STORY'].includes(mediaType)) {
      return res.status(400).json({ error: 'Formato de publicação inválido.' });
    }
    if (mediaType === 'CAROUSEL' && (mediaUrls.length < 2 || mediaUrls.length > 10)) {
      return res.status(400).json({ error: 'Um carrossel precisa ter entre 2 e 10 mídias.' });
    }
    const targetDate = new Date(scheduledFor);
    if (Number.isNaN(targetDate.getTime())) return res.status(400).json({ error: 'Data de publicação inválida.' });

    const post = await prisma.scheduledPost.create({
      data: {
        userId: req.user.id,
        accountId,
        threadsAccountId: threadsAccount?.id,
        mediaType,
        mediaUrls,
        caption,
        hashtags,
        platforms: normalizedPlatforms,
        scheduledFor: targetDate,
        status: status || PostStatus.DRAFT,
      }
    });

    if (post.status === 'SCHEDULED') {
      await schedulePost(post.id, post.scheduledFor);
    }

    res.status(201).json(post);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req: any, res, next) => {
  try {
    const { status, accountId } = req.query;
    const where: any = { userId: req.user.id };
    if (status) where.status = status;
    if (accountId) where.accountId = accountId;

    const posts = await prisma.scheduledPost.findMany({ where, orderBy: { scheduledFor: 'asc' } });
    res.json(posts);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: any, res, next) => {
  try {
    const post = await prisma.scheduledPost.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req: any, res, next) => {
  try {
    const { caption, scheduledFor, status, platforms, threadsAccountId } = req.body;
    const post = await prisma.scheduledPost.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (post.status === 'SCHEDULED' && (status === 'DRAFT' || scheduledFor)) {
      await cancelScheduledPost(post.id);
    }

    const updatedPost = await prisma.scheduledPost.update({
      where: { id: post.id },
      data: {
        caption,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
        status,
        platforms: Array.isArray(platforms) && platforms.length ? platforms : undefined,
        threadsAccountId: threadsAccountId || undefined,
      }
    });

    if (updatedPost.status === 'SCHEDULED') {
      await schedulePost(updatedPost.id, updatedPost.scheduledFor);
    }

    res.json(updatedPost);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: any, res, next) => {
  try {
    const post = await prisma.scheduledPost.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { publishedPost: true }
    });
    
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (post.status === 'SCHEDULED') {
      await cancelScheduledPost(post.id);
    }

    if (post.publishedPost?.igMediaId) {
      await deletePost(post.publishedPost.igMediaId, post.accountId);
    }

    await prisma.scheduledPost.delete({ where: { id: post.id } });
    res.json({ message: 'Post deleted' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/publish', async (req: any, res, next) => {
  try {
    const post = await prisma.scheduledPost.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (post.status === 'SCHEDULED') {
      await cancelScheduledPost(post.id);
    }

    const published = await publishPost(post.id);
    res.json(published);
  } catch (error) {
    next(error);
  }
});

router.post('/upload', upload.array('files'), (req: any, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) return res.status(400).json({ error: 'Nenhum arquivo foi enviado.' });
  const publicBase = env.MEDIA_PUBLIC_URL.replace(/\/$/, '');
  const fileUrls = files.map((file: Express.Multer.File) => {
    return `${publicBase}/${file.filename}`;
  });
  res.json({ urls: fileUrls });
});

export default router;
