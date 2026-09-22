import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { ZodError } from 'zod';

const publicMessage = (message: string) => {
  const normalized = message.toLowerCase();
  if (message === 'THREADS_OAUTH_NOT_CONFIGURED') {
    return 'A conexão automática com Threads ainda não foi habilitada neste sistema. Você não precisa criar um aplicativo nem copiar tokens; o administrador precisa concluir a configuração uma vez no servidor.';
  }
  if (normalized.includes('instagram public content access')) {
    return 'A pesquisa de hashtags da Meta ainda não foi aprovada para este aplicativo. O administrador precisa solicitar o recurso Instagram Public Content Access no Meta for Developers.';
  }
  if (normalized.includes('oauth access token') || normalized.includes('invalid oauth') || normalized.includes('access token')) {
    return 'A autorização da Meta expirou ou não tem a permissão necessária. Conecte a conta novamente em Contas conectadas.';
  }
  if (normalized.includes('business discovery')) {
    return 'A Meta não liberou a consulta deste perfil. Verifique se o concorrente é público e se o recurso Business Discovery está disponível para o aplicativo.';
  }
  if (normalized.includes('manage_comments') || normalized.includes('comment')) {
    return 'A Meta ainda não liberou o gerenciamento de comentários para esta conexão. Solicite instagram_manage_comments no App Review e conecte a conta novamente.';
  }
  if (message.startsWith('Instagram API Error:')) {
    return 'A Meta recusou esta operação. Revise as permissões da conexão e tente novamente.';
  }
  return message;
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: publicMessage(err.message),
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation error',
      errors: err.errors,
    });
  }

  console.error('Unhandled error:', err);

  return res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
};
