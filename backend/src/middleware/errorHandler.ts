import { Request, Response, NextFunction } from 'express';
import { AppError, InstagramApiError } from '../utils/errors';
import { ZodError } from 'zod';
import { publicMetaMessage } from '../utils/public-meta-message';

const publicMessage = (message: string) => {
  const normalized = message.toLowerCase();
  if (message === 'THREADS_OAUTH_NOT_CONFIGURED') {
    return 'A conexão automática com Threads ainda não foi habilitada neste sistema. Você não precisa criar um aplicativo nem copiar tokens; o administrador precisa concluir a configuração uma vez no servidor.';
  }
  if (normalized.includes('instagram public content access')) return publicMetaMessage(message);
  if (normalized.includes('pages_manage_posts') || normalized.includes('publish_to_groups')) return publicMetaMessage(message);
  if (normalized.includes('oauth access token') || normalized.includes('invalid oauth') || normalized.includes('access token')) {
    return 'A autorização da Meta expirou ou não tem a permissão necessária. Conecte a conta novamente em Contas conectadas.';
  }
  if (normalized.includes('business discovery')) {
    return 'A Meta não liberou a consulta deste perfil. Verifique se o concorrente é público e se o recurso Business Discovery está disponível para o aplicativo.';
  }
  if (normalized.includes('manage_comments') || normalized.includes('comment')) return publicMetaMessage(message);
  if (message.startsWith('Instagram API Error:')) {
    return 'A Meta recusou esta operação. Revise as permissões da conexão e tente novamente.';
  }
  return message;
};

const metaGraphPublicMessage = (error: InstagramApiError) => {
  const code = error.metaCode === undefined ? '' : ` (código Meta ${error.metaCode}${error.metaSubcode === undefined ? '' : `/${error.metaSubcode}`})`;
  const reference = error.fbtraceId ? ` Referência: ${error.fbtraceId}.` : '';
  const diagnostic = error.metaCode === 3 && error.metaMessage ? ` Detalhe informado pela Meta: ${error.metaMessage}` : '';

  if (error.metaCode === 10 || error.metaCode === 200) {
    return `A Meta recusou a operação por permissão ou configuração do app.${code}${reference}`;
  }
  if (error.metaCode === 190) {
    return `A autorização da Meta expirou ou foi revogada. Reconecte a conta.${code}${reference}`;
  }
  if (error.metaCode === 100) {
    return `A Meta recusou um parâmetro da solicitação. Confira a configuração dos eventos.${code}${reference}`;
  }
  return `A Meta recusou a operação.${code}${reference}${diagnostic}`;
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
      message: err instanceof InstagramApiError ? metaGraphPublicMessage(err) : publicMessage(err.message),
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
