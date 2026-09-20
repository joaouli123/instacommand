import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from '../utils/errors';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export const getBearerOrCookieToken = (req: Request) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
  return bearerToken || req.cookies?.instacommand_token;
};

export const verifyAuthToken = (req: Request) => {
  const token = getBearerOrCookieToken(req);
  if (!token) return null;

  try {
    return jwt.verify(token, env.JWT_SECRET) as { id: string; email: string };
  } catch {
    return null;
  }
};

export const authenticate = (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const decoded = verifyAuthToken(req);
    if (!decoded) {
      throw new UnauthorizedError('No token provided');
    }

    req.user = decoded;
    next();
  } catch (error) {
    next(new UnauthorizedError('Invalid or expired token'));
  }
};
