import { ValidationError } from '../../utils/errors';

export type InstagramUserTag = {
  username: string;
  x: number;
  y: number;
  mediaIndex: number;
};

export type InstagramAdvancedSettings = {
  altTexts: string[];
  collaborators: string[];
  firstComment: string;
  disableComments: boolean;
  userTags: InstagramUserTag[];
};

export const emptyInstagramAdvancedSettings = (): InstagramAdvancedSettings => ({
  altTexts: [],
  collaborators: [],
  firstComment: '',
  disableComments: false,
  userTags: [],
});

const normalizeUsername = (value: unknown) => typeof value === 'string'
  ? value.trim().replace(/^@+/, '').toLowerCase()
  : '';

const isUsername = (value: string) => /^[a-z0-9._]{1,30}$/i.test(value);

export const validateInstagramAdvancedSettings = (
  input: unknown,
  mediaType: string,
  mediaCount: number,
): InstagramAdvancedSettings => {
  if (input === undefined || input === null) return emptyInstagramAdvancedSettings();
  if (typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('As configurações avançadas estão inválidas.');

  const raw = input as Record<string, unknown>;
  const defaults = emptyInstagramAdvancedSettings();
  const altTexts = raw.altTexts === undefined ? defaults.altTexts : raw.altTexts;
  const collaborators = raw.collaborators === undefined ? defaults.collaborators : raw.collaborators;
  const firstComment = raw.firstComment === undefined ? defaults.firstComment : raw.firstComment;
  const disableComments = raw.disableComments === undefined ? defaults.disableComments : raw.disableComments;
  const userTags = raw.userTags === undefined ? defaults.userTags : raw.userTags;

  if (!Array.isArray(altTexts) || altTexts.length > mediaCount || altTexts.some((text) => typeof text !== 'string' || text.length > 1000)) {
    throw new ValidationError('O texto alternativo pode ter até 1.000 caracteres por imagem.');
  }
  if (!Array.isArray(collaborators) || collaborators.length > 3) {
    throw new ValidationError('Escolha no máximo 3 colaboradores.');
  }
  const normalizedCollaborators = collaborators.map(normalizeUsername);
  if (normalizedCollaborators.some((username) => !isUsername(username))
    || new Set(normalizedCollaborators).size !== normalizedCollaborators.length) {
    throw new ValidationError('Confira os @usuários dos colaboradores.');
  }
  if (!['IMAGE', 'CAROUSEL', 'REEL'].includes(mediaType) && normalizedCollaborators.length > 0) {
    throw new ValidationError('Colaboradores estão disponíveis para fotos, carrosséis e Reels do Instagram.');
  }
  if (typeof firstComment !== 'string' || firstComment.length > 2200) {
    throw new ValidationError('O primeiro comentário deve ter até 2.200 caracteres.');
  }
  if ((firstComment.trim() || disableComments === true)
    && !['IMAGE', 'CAROUSEL', 'REEL'].includes(mediaType)) {
    throw new ValidationError('Primeiro comentário e controle de comentários estão disponíveis em posts e Reels, não em Stories.');
  }
  if (typeof disableComments !== 'boolean') throw new ValidationError('A opção de desativar comentários está inválida.');
  if (!Array.isArray(userTags) || userTags.length > 20) throw new ValidationError('Marque até 20 pessoas por publicação.');
  if (userTags.length && !['IMAGE', 'CAROUSEL'].includes(mediaType)) {
    throw new ValidationError('A marcação de pessoas está disponível em fotos do feed e carrosséis.');
  }

  const normalizedUserTags = userTags.map((tag): InstagramUserTag | null => {
    if (!tag || typeof tag !== 'object' || Array.isArray(tag)) return null;
    const value = tag as Record<string, unknown>;
    const username = normalizeUsername(value.username);
    const mediaIndex = value.mediaIndex;
    const x = value.x;
    const y = value.y;
    if (!isUsername(username) || !Number.isInteger(mediaIndex) || Number(mediaIndex) < 0 || Number(mediaIndex) >= mediaCount
      || typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1
      || typeof y !== 'number' || !Number.isFinite(y) || y < 0 || y > 1) return null;
    return { username, x, y, mediaIndex: Number(mediaIndex) };
  });
  if (normalizedUserTags.some((tag) => tag === null)) throw new ValidationError('Revise o @usuário e a posição das pessoas marcadas.');
  if (normalizedUserTags.some((tag) => mediaType === 'IMAGE' && tag?.mediaIndex !== 0)) {
    throw new ValidationError('A foto única só pode receber marcações na própria imagem.');
  }

  return {
    altTexts: altTexts as string[],
    collaborators: normalizedCollaborators,
    firstComment: firstComment.trim(),
    disableComments: disableComments as boolean,
    userTags: normalizedUserTags as InstagramUserTag[],
  };
};
