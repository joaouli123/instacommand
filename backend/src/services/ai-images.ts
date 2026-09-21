import { ValidationError } from '../utils/errors';

export type AiImage = { mimeType: string; data: string };
export const MAX_AI_IMAGE_BYTES = 4 * 1024 * 1024;
export const validateAiImages = (files: Array<{ buffer: Buffer; mimetype: string }>): AiImage[] => {
  if (!files.length || files.length > 3) throw new ValidationError('Selecione de 1 a 3 imagens.');
  return files.map(file => {
    const bytes = file.buffer;
    if (!bytes.length || bytes.length > MAX_AI_IMAGE_BYTES) throw new ValidationError('Cada imagem deve ter até 4 MB.');
    const mimeType = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
      : bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
      : bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
    if (!mimeType || mimeType !== file.mimetype) throw new ValidationError('Arquivo inválido. Use um print PNG, JPG ou WebP, sem renomear outro tipo de arquivo.');
    return { mimeType, data: bytes.toString('base64') };
  });
};
