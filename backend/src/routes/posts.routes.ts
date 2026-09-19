import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { PrismaClient, MediaType, PostStatus } from '@prisma/client';
import { schedulePost, cancelScheduledPost } from '../services/scheduler.service';
import { publishPost, deletePost } from '../services/instagram/publish.service';
import path from 'path';
import fs from 'fs';

const router = Router();
const prisma = new PrismaClient();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.resolve(process.cwd(), process.env.MEDIA_UPLOAD_DIR || './uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

router.use(authenticate);

router.post('/', async (req: any, res, next) => {
  try {
    const { accountId, mediaType, mediaUrls, caption, hashtags, scheduledFor, status } = req.body;
    
    const post = await prisma.scheduledPost.create({
      data: {
        userId: req.user.id,
        accountId,
        mediaType,
        mediaUrls,
        caption,
        hashtags,
        scheduledFor: new Date(scheduledFor),
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
    const { caption, scheduledFor, status } = req.body;
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

    if (post.publishedPost) {
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
  const fileUrls = req.files.map((file: Express.Multer.File) => {
    return `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
  });
  res.json({ urls: fileUrls });
});

export default router;
