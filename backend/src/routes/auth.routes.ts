import { Router } from 'express';
import { getOAuthUrl, handleOAuthCallback } from '../services/instagram/auth.service';
import { authenticate } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const router = Router();
const prisma = new PrismaClient();

// This endpoint redirects to FB login
router.get('/facebook', (req, res) => {
  const url = getOAuthUrl();
  res.redirect(url);
});

// FB callback
router.get('/facebook/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Code is missing' });
    }
    
    // In a real app, you'd extract user from session or state. Here we simulate finding/creating a user.
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: { email: 'test@example.com', name: 'Test User' }
      });
    }

    const accounts = await handleOAuthCallback(code, user.id);

    const token = jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, { expiresIn: '1d' });

    res.json({ message: 'Authentication successful', token, accounts });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', authenticate, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

router.get('/me', authenticate, async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

export default router;
