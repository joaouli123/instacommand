import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { PrismaClient, MediaType, PostStatus } from '@prisma/client';
import { schedulePost, cancelScheduledPost } from '../services/scheduler.service';
import { publishPost, deleteFacebookPost, deleteThreadsPost } from '../services/instagram/publish.service';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { env } from '../config/env';
import { assertPostReady } from '../services/post-readiness';
import { ConflictError } from '../utils/errors';
import { publicMediaBase, normalizeMediaUrl } from '../utils/public-media';
import { publicMetaMessage } from '../utils/public-meta-message';
import { graphGet } from '../utils/instagram-api';
import { getDecryptedToken } from '../services/instagram/auth.service';

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
    const { accountId, threadsAccountId, mediaType, mediaUrls, caption, hashtags, platforms, scheduledFor, status,
      isAiGenerated, instagramAudioId, instagramAudioTitle, instagramAudioArtist,
      instagramAudioVolume, instagramVideoVolume } = req.body;
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
    if (!['IMAGE', 'CAROUSEL', 'REEL', 'STORY', 'TEXT'].includes(mediaType)) {
      return res.status(400).json({ error: 'Formato de publicação inválido.' });
    }
    if (mediaType === 'TEXT' && (!textOnlyThreads || mediaUrls.length > 0 || !String(caption || '').trim() || String(caption).length > 500)) {
      return res.status(400).json({ error: 'Post de texto exige somente Threads, sem mídia e com até 500 caracteres.' });
    }
    if (mediaType === 'STORY' && normalizedPlatforms.some((platform: string) => platform !== 'INSTAGRAM')) {
      return res.status(400).json({ error: 'Stories só podem ser publicados pelo Instagram nesta versão da API.' });
    }
    if (isAiGenerated !== undefined && typeof isAiGenerated !== 'boolean') {
      return res.status(400).json({ error: 'A opção de conteúdo gerado por IA é inválida.' });
    }
    if (isAiGenerated === true && !normalizedPlatforms.includes('INSTAGRAM')) {
      return res.status(400).json({ error: 'A identificação de conteúdo gerado por IA está disponível para publicações no Instagram.' });
    }
    const normalizedAudioId = instagramAudioId === undefined || instagramAudioId === null || instagramAudioId === ''
      ? null
      : typeof instagramAudioId === 'string' && /^\d{1,30}$/.test(instagramAudioId) ? instagramAudioId : undefined;
    if (normalizedAudioId === undefined) return res.status(400).json({ error: 'Escolha uma faixa de áudio válida do Instagram.' });
    if (normalizedAudioId && (mediaType !== 'REEL' || !normalizedPlatforms.includes('INSTAGRAM'))) {
      return res.status(400).json({ error: 'A música da biblioteca do Instagram só pode ser adicionada a um Reel do Instagram.' });
    }
    const validVolume = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100;
    if (normalizedAudioId && ((instagramAudioVolume !== undefined && !validVolume(instagramAudioVolume))
      || (instagramVideoVolume !== undefined && !validVolume(instagramVideoVolume)))) {
      return res.status(400).json({ error: 'Os volumes do áudio precisam ficar entre 0 e 100.' });
    }
    if (normalizedAudioId && ((instagramAudioTitle !== undefined && (typeof instagramAudioTitle !== 'string' || instagramAudioTitle.length > 200))
      || (instagramAudioArtist !== undefined && (typeof instagramAudioArtist !== 'string' || instagramAudioArtist.length > 200)))) {
      return res.status(400).json({ error: 'Os dados da faixa de áudio são inválidos.' });
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
        isAiGenerated: isAiGenerated === true,
        instagramAudioId: normalizedAudioId,
        instagramAudioTitle: normalizedAudioId ? instagramAudioTitle || null : null,
        instagramAudioArtist: normalizedAudioId ? instagramAudioArtist || null : null,
        instagramAudioVolume: normalizedAudioId ? instagramAudioVolume ?? 80 : null,
        instagramVideoVolume: normalizedAudioId ? instagramVideoVolume ?? 60 : null,
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
    res.json(posts.map(post => ({ ...post, mediaUrls: post.mediaUrls.map(normalizeMediaUrl) })));
  } catch (error) {
    next(error);
  }
});

router.get('/instagram-audio', async (req: any, res, next) => {
  try {
    const accountId = String(req.query.accountId || '');
    const audioType = String(req.query.type || 'music');
    const query = String(req.query.q || '').trim();
    if (!accountId) return res.status(400).json({ error: 'Selecione uma conta do Instagram.' });
    if (!['music', 'original_sound'].includes(audioType)) return res.status(400).json({ error: 'Escolha música ou áudio original.' });
    if (query.length > 100) return res.status(400).json({ error: 'A busca de áudio deve ter até 100 caracteres.' });

    const account = await prisma.instagramAccount.findFirst({ where: { id: accountId, userId: req.user.id, isActive: true } });
    if (!account) return res.status(404).json({ error: 'A conta do Instagram selecionada não está ativa.' });

    const token = await getDecryptedToken(account.id);
    const response = await graphGet('/ig_audio', token, {
      ig_user_id: account.igUserId,
      audio_type: audioType,
      q: query || undefined,
      fields: 'id,title,audio_type,duration_in_ms,display_artist,cover_artwork_thumbnail_url,download_url,ig_username,profile_picture_url,is_ads_eligible,on_platform_audio_preview_link',
      limit: 30,
    });
    const items = Array.isArray(response.data) ? response.data.slice(0, 30).flatMap((track: any) => {
      if (!track?.id) return [];
      return [{
        id: String(track.id),
        title: String(track.title || 'Áudio do Instagram'),
        audioType: track.audio_type || audioType,
        durationInMs: Number.isFinite(Number(track.duration_in_ms)) ? Number(track.duration_in_ms) : null,
        artist: track.display_artist || null,
        creatorUsername: track.ig_username || null,
        coverUrl: track.cover_artwork_thumbnail_url || track.profile_picture_url || null,
        previewUrl: track.download_url || null,
        previewLink: track.on_platform_audio_preview_link || null,
      }];
    }) : [];
    res.json({ items });
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
    res.json({ ...post, mediaUrls: post.mediaUrls.map(normalizeMediaUrl) });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req: any, res, next) => {
  try {
    const { caption, scheduledFor, status, platforms, threadsAccountId, mediaUrls, mediaType, hashtags,
      isAiGenerated, instagramAudioId, instagramAudioTitle, instagramAudioArtist,
      instagramAudioVolume, instagramVideoVolume } = req.body;
    const post = await prisma.scheduledPost.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (!['DRAFT', 'SCHEDULED', 'FAILED'].includes(post.status)) return res.status(409).json({ error: 'Esta publicação não pode mais ser editada.' });
    if (status !== undefined && !['DRAFT', 'SCHEDULED'].includes(status)) return res.status(400).json({ error: 'Status de edição inválido.' });
    if (mediaUrls !== undefined && (!Array.isArray(mediaUrls) || mediaUrls.length > 10 || mediaUrls.some((url: unknown) => typeof url !== 'string' || !/^https?:\/\//.test(url)))) return res.status(400).json({ error: 'Mídias inválidas.' });
    if (mediaType !== undefined && !['IMAGE', 'CAROUSEL', 'REEL', 'STORY', 'TEXT'].includes(mediaType)) return res.status(400).json({ error: 'Formato inválido.' });
    if (caption !== undefined && (typeof caption !== 'string' || caption.length > 2200)) return res.status(400).json({ error: 'A legenda deve ter até 2200 caracteres.' });
    if (hashtags !== undefined && (!Array.isArray(hashtags) || hashtags.length > 30 || hashtags.some((tag: unknown) => typeof tag !== 'string' || tag.length > 100))) return res.status(400).json({ error: 'Hashtags inválidas.' });
    if (platforms !== undefined && (!Array.isArray(platforms) || !platforms.length)) return res.status(400).json({ error: 'Selecione ao menos uma rede.' });
    if (isAiGenerated !== undefined && typeof isAiGenerated !== 'boolean') return res.status(400).json({ error: 'A opção de conteúdo gerado por IA é inválida.' });

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
    const nextMediaType = mediaType || post.mediaType;
    const nextMediaUrls = mediaUrls ?? post.mediaUrls;
    const nextCaption = caption ?? post.caption;
    const nextIsAiGenerated = isAiGenerated === undefined ? post.isAiGenerated : isAiGenerated;
    if (nextIsAiGenerated && !nextPlatforms.includes('INSTAGRAM')) return res.status(400).json({ error: 'A identificação de conteúdo gerado por IA está disponível para publicações no Instagram.' });
    const nextAudioId = instagramAudioId === undefined ? post.instagramAudioId : instagramAudioId === null || instagramAudioId === '' ? null
      : typeof instagramAudioId === 'string' && /^\d{1,30}$/.test(instagramAudioId) ? instagramAudioId : undefined;
    if (nextAudioId === undefined) return res.status(400).json({ error: 'Escolha uma faixa de áudio válida do Instagram.' });
    if (nextAudioId && (nextMediaType !== 'REEL' || !nextPlatforms.includes('INSTAGRAM'))) return res.status(400).json({ error: 'A música da biblioteca do Instagram só pode ser adicionada a um Reel do Instagram.' });
    const validVolume = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100;
    const nextAudioVolume = instagramAudioVolume === undefined ? post.instagramAudioVolume : instagramAudioVolume;
    const nextVideoVolume = instagramVideoVolume === undefined ? post.instagramVideoVolume : instagramVideoVolume;
    if (nextAudioId && ((nextAudioVolume !== null && !validVolume(nextAudioVolume)) || (nextVideoVolume !== null && !validVolume(nextVideoVolume)))) {
      return res.status(400).json({ error: 'Os volumes do áudio precisam ficar entre 0 e 100.' });
    }
    if (nextAudioId && ((instagramAudioTitle !== undefined && instagramAudioTitle !== null && (typeof instagramAudioTitle !== 'string' || instagramAudioTitle.length > 200))
      || (instagramAudioArtist !== undefined && instagramAudioArtist !== null && (typeof instagramAudioArtist !== 'string' || instagramAudioArtist.length > 200)))) {
      return res.status(400).json({ error: 'Os dados da faixa de áudio são inválidos.' });
    }
    if (nextMediaType === 'TEXT' && (nextPlatforms.length !== 1 || nextPlatforms[0] !== 'THREADS' || nextMediaUrls.length > 0 || !String(nextCaption || '').trim() || String(nextCaption).length > 500)) {
      return res.status(400).json({ error: 'Post de texto exige somente Threads, sem mídia e com até 500 caracteres.' });
    }
    if ((mediaType || post.mediaType) === 'STORY' && nextPlatforms.some((platform: string) => platform !== 'INSTAGRAM')) {
      return res.status(400).json({ error: 'Stories só podem ser publicados pelo Instagram nesta versão da API.' });
    }

    const nextDate = scheduledFor ? new Date(scheduledFor) : post.scheduledFor;
    if (Number.isNaN(nextDate.getTime())) return res.status(400).json({ error: 'Data de publicação inválida.' });
    if ((status || post.status) === 'SCHEDULED') {
      if (nextDate <= new Date()) return res.status(400).json({ error: 'Escolha uma data futura.' });
      assertPostReady({ ...post, caption: nextCaption, mediaType: nextMediaType, mediaUrls: nextMediaUrls, platforms: nextPlatforms });
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
        isAiGenerated: isAiGenerated === undefined ? undefined : nextIsAiGenerated,
        instagramAudioId: instagramAudioId === undefined ? undefined : nextAudioId,
        instagramAudioTitle: nextAudioId ? (instagramAudioTitle === undefined ? undefined : instagramAudioTitle) : null,
        instagramAudioArtist: nextAudioId ? (instagramAudioArtist === undefined ? undefined : instagramAudioArtist) : null,
        instagramAudioVolume: nextAudioId ? nextAudioVolume ?? 80 : null,
        instagramVideoVolume: nextAudioId ? nextVideoVolume ?? 60 : null,
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
      warnings.push('O post do Instagram não foi removido do perfil: a API oficial não permite excluir mídia publicada. Exclua-o no Instagram.');
    }
    if (post.publishedPost?.facebookPostId) {
      try {
        await deleteFacebookPost(post.publishedPost.facebookPostId, post.accountId);
      } catch (error) {
        console.error(`Could not delete Facebook post ${post.publishedPost.facebookPostId}:`, error);
        warnings.push('O post do Facebook pode continuar na Página; a Meta recusou a exclusão. Confira permissões e remova-o na Página se necessário.');
      }
    }
    if (post.publishedPost?.threadsPostId) {
      if (!post.threadsAccountId) {
        warnings.push('O post do Threads pode continuar no perfil; não foi possível localizar a conta conectada.');
      } else {
        try {
          await deleteThreadsPost(post.publishedPost.threadsPostId, post.threadsAccountId);
        } catch (error) {
          console.error(`Could not delete Threads post ${post.publishedPost.threadsPostId}:`, error);
          warnings.push('O post do Threads pode continuar no perfil; reconecte a conta autorizando a permissão threads_delete e tente novamente.');
        }
      }
    }

    const uploadRoot = path.resolve(process.cwd(), env.MEDIA_UPLOAD_DIR);
    const publicBase = publicMediaBase();
    const uploadedFiles = post.mediaUrls
      .map(normalizeMediaUrl)
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
    if (!published) {
      return res.status(409).json({ error: 'Esta publicação não foi processada. Atualize o calendário e confira o estado antes de tentar novamente.' });
    }
    const latestState = await prisma.scheduledPost.findFirst({
      where: { id: post.id, userId: req.user.id },
      select: { platforms: true, errorMessage: true },
    });
    const publishResults = (published?.publishResults || {}) as Record<string, unknown>;
    const succeeded = Object.keys(publishResults);
    const failures = (latestState?.errorMessage || '')
      .split(' | ')
      .map((entry) => {
        const separator = entry.indexOf(':');
        return separator > 0
          ? { platform: entry.slice(0, separator).trim(), message: entry.slice(separator + 1).trim() }
          : null;
      })
      .filter((entry): entry is { platform: string; message: string } => Boolean(entry));
    const failedPlatforms = (latestState?.platforms || []).filter((platform) => !succeeded.includes(platform));
    res.json({
      ...published,
      publishSummary: {
        succeeded,
        failed: failedPlatforms.map((platform) => ({
          platform,
          message: publicMetaMessage(failures.find((failure) => failure.platform.toUpperCase() === platform)?.message || 'Não foi possível publicar nesta rede.'),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/upload', upload.array('files'), (req: any, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) return res.status(400).json({ error: 'Nenhum arquivo foi enviado.' });
  const publicBase = publicMediaBase();
  const fileUrls = files.map((file: Express.Multer.File) => {
    return `${publicBase}/${file.filename}`;
  });
  res.json({ urls: fileUrls });
});

export default router;
