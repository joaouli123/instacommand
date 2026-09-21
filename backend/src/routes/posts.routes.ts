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
import { assertPostReady } from '../services/post-readiness';
import { ConflictError } from '../utils/errors';

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
    if (status !== undefined && !['DRAFT', 'SCHEDULED'].includes(status)) return res.status(400).json({ error: 'Status de criação inválido.' });
    const normalizedPlatforms = Array.isArray(platforms) && platforms.length ? platforms : ['INSTAGRAM'];
    const textOnlyThreads = normalizedPlatforms.length === 1 && normalizedPlatforms[0] === 'THREADS';
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
    if (normalizedPlatforms.includes('FACEBOOK') && !account.pageId) {
      return res.status(400).json({ error: 'A conta selecionada não possui uma Página do Facebook vinculada.' });
    }
    if (!Array.isArray(mediaUrls) || (mediaUrls.length === 0 && !textOnlyThreads)) {
      return res.status(400).json({ error: 'Envie pelo menos uma mídia.' });
    }
    if (textOnlyThreads && mediaUrls.length === 0 && !String(caption || '').trim()) {
      return res.status(400).json({ error: 'Escreva um texto antes de publicar somente no Threads.' });
    }
    if (!['IMAGE', 'CAROUSEL', 'REEL', 'STORY'].includes(mediaType)) {
      return res.status(400).json({ error: 'Formato de publicação inválido.' });
    }
    if (mediaType === 'STORY' && normalizedPlatforms.some((platform: string) => platform !== 'INSTAGRAM')) {
      return res.status(400).json({ error: 'Stories só podem ser publicados pelo Instagram nesta versão da API.' });
    }
    if (mediaType === 'CAROUSEL' && (mediaUrls.length < 2 || mediaUrls.length > 10)) {
      return res.status(400).json({ error: 'Um carrossel precisa ter entre 2 e 10 mídias.' });
    }
    const targetDate = new Date(scheduledFor);
    if (Number.isNaN(targetDate.getTime())) return res.status(400).json({ error: 'Data de publicação inválida.' });
    if (status === 'SCHEDULED') {
      if (targetDate <= new Date()) return res.status(400).json({ error: 'Escolha uma data futura.' });
      assertPostReady({ mediaType, mediaUrls, caption, platforms: normalizedPlatforms });
    }

    const post = await prisma.scheduledPost.create({
      data: {
        userId: req.user.id,
        accountId,
        threadsAccountId: threadsAccount?.id,
        mediaType,
        mediaUrls,
        caption,
        hashtags: Array.isArray(hashtags) ? hashtags : [],
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

    const posts = await prisma.scheduledPost.findMany({
      where,
      orderBy: { scheduledFor: 'asc' },
      include: {
        publishedPost: {
          select: {
            id: true,
            igMediaId: true,
            facebookPostId: true,
            threadsPostId: true,
            publishResults: true,
            igPermalink: true,
            publishedAt: true,
          },
        },
      },
    });
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
    const { caption, scheduledFor, status, platforms, threadsAccountId, mediaUrls, mediaType, hashtags } = req.body;
    const post = await prisma.scheduledPost.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (!['DRAFT', 'SCHEDULED', 'FAILED'].includes(post.status)) return res.status(409).json({ error: 'Esta publicação não pode mais ser editada.' });
    if (status !== undefined && !['DRAFT', 'SCHEDULED'].includes(status)) return res.status(400).json({ error: 'Status de edição inválido.' });
    if (mediaUrls !== undefined && (!Array.isArray(mediaUrls) || mediaUrls.length > 10 || mediaUrls.some((url: unknown) => typeof url !== 'string' || !/^https?:\/\//.test(url)))) return res.status(400).json({ error: 'Mídias inválidas.' });
    if (mediaType !== undefined && !['IMAGE', 'CAROUSEL', 'REEL', 'STORY'].includes(mediaType)) return res.status(400).json({ error: 'Formato inválido.' });
    if (caption !== undefined && (typeof caption !== 'string' || caption.length > 2200)) return res.status(400).json({ error: 'A legenda deve ter até 2200 caracteres.' });
    if (hashtags !== undefined && (!Array.isArray(hashtags) || hashtags.length > 30 || hashtags.some((tag: unknown) => typeof tag !== 'string' || tag.length > 100))) return res.status(400).json({ error: 'Hashtags inválidas.' });
    if (platforms !== undefined && (!Array.isArray(platforms) || !platforms.length)) return res.status(400).json({ error: 'Selecione ao menos uma rede.' });

    const nextPlatforms = Array.isArray(platforms) && platforms.length ? platforms : post.platforms;
    const unsupportedPlatform = nextPlatforms.find((platform: unknown) => !['INSTAGRAM', 'FACEBOOK', 'THREADS'].includes(String(platform)));
    if (unsupportedPlatform) return res.status(400).json({ error: `Plataforma não suportada: ${unsupportedPlatform}` });

    if (nextPlatforms.includes('THREADS')) {
      const nextThreadsAccountId = threadsAccountId === undefined ? post.threadsAccountId : threadsAccountId;
      const threadsAccount = nextThreadsAccountId
        ? await prisma.threadsAccount.findFirst({ where: { id: nextThreadsAccountId, userId: req.user.id, isActive: true } })
        : null;
      if (!threadsAccount) return res.status(400).json({ error: 'Conecte uma conta do Threads antes de selecionar essa plataforma.' });
    }
    if (nextPlatforms.includes('FACEBOOK')) {
      const account = await prisma.instagramAccount.findFirst({ where: { id: post.accountId, userId: req.user.id, isActive: true } });
      if (!account?.pageId) return res.status(400).json({ error: 'A conta selecionada não possui uma Página do Facebook vinculada.' });
    }
    if ((mediaType || post.mediaType) === 'STORY' && nextPlatforms.some((platform: string) => platform !== 'INSTAGRAM')) {
      return res.status(400).json({ error: 'Stories só podem ser publicados pelo Instagram nesta versão da API.' });
    }

    const nextDate = scheduledFor ? new Date(scheduledFor) : post.scheduledFor;
    if (Number.isNaN(nextDate.getTime())) return res.status(400).json({ error: 'Data de publicação inválida.' });
    if ((status || post.status) === 'SCHEDULED') {
      if (nextDate <= new Date()) return res.status(400).json({ error: 'Escolha uma data futura.' });
      assertPostReady({ ...post, caption: caption ?? post.caption, mediaType: mediaType || post.mediaType, mediaUrls: mediaUrls ?? post.mediaUrls, platforms: nextPlatforms });
    }

    if (post.status === 'SCHEDULED' && (status === 'DRAFT' || scheduledFor)) {
      await cancelScheduledPost(post.id);
    }

    const updatedPost = await prisma.scheduledPost.update({
      // Do not overwrite a worker claim or a concurrent editor.
      where: { id: post.id, status: post.status, updatedAt: post.updatedAt },
      data: {
        caption,
        mediaUrls,
        mediaType,
        hashtags,
        scheduledFor: scheduledFor ? nextDate : undefined,
        status,
        platforms: Array.isArray(platforms) && platforms.length ? nextPlatforms : undefined,
        threadsAccountId: threadsAccountId === null ? null : threadsAccountId || undefined,
      }
    }).catch((error) => {
      if (error?.code === 'P2025') throw new ConflictError('Esta publicação mudou ou já está sendo enviada. Atualize a tela antes de editar.');
      throw error;
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

    const warnings: string[] = [];
    if (post.publishedPost?.igMediaId) {
      try {
        await deletePost(post.publishedPost.igMediaId, post.accountId);
      } catch (error) {
        console.error(`Could not delete Instagram media ${post.publishedPost.igMediaId}:`, error);
        warnings.push('O conteúdo do Instagram não pôde ser removido remotamente; verifique a conexão da Meta.');
      }
    }
    if (post.publishedPost?.facebookPostId) warnings.push('A publicação do Facebook permanece na Página; a API atual não permite removê-la por este painel.');
    if (post.publishedPost?.threadsPostId) warnings.push('A publicação do Threads permanece no perfil; a API atual não permite removê-la por este painel.');

    const uploadRoot = path.resolve(process.cwd(), env.MEDIA_UPLOAD_DIR);
    const publicBase = env.MEDIA_PUBLIC_URL.replace(/\/$/, '');
    const uploadedFiles = post.mediaUrls
      .filter((url) => typeof url === 'string' && url.startsWith(`${publicBase}/`))
      .map((url) => {
        const filename = decodeURIComponent(url.slice(publicBase.length + 1)).split(/[?#]/)[0];
        if (!filename || filename.includes('/') || filename.includes('\\')) return null;
        return path.resolve(uploadRoot, filename);
      })
      .filter((filePath): filePath is string => {
        if (!filePath) return false;
        return filePath.startsWith(`${uploadRoot}${path.sep}`);
      });

    await prisma.$transaction(async (tx) => {
      await tx.scheduledPost.delete({ where: { id: post.id } });
      if (post.publishedPostId) {
        await tx.publishedPost.deleteMany({ where: { id: post.publishedPostId } });
      }
    });
    await Promise.all(uploadedFiles.map(async (filePath) => {
      try { await fs.promises.unlink(filePath); } catch (error: any) {
        if (error?.code !== 'ENOENT') console.error(`Could not remove uploaded file ${filePath}:`, error);
      }
    }));
    res.json({ message: 'Post deleted', warnings });
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
