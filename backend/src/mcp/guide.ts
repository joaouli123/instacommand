import { DEFAULT_TIMEZONE } from './tool-kit';

// Facts here mirror the validation in posts.routes.ts, post-readiness.ts and
// advanced-settings.ts. Update them together.
export const PUBLISHING_GUIDE = {
  workflow: [
    '1. get_workspace_overview para obter accountId (Instagram), threadsAccountId e permissões.',
    '2. Mídias: import_media_from_url (URL pública e direta do arquivo) ou upload_media_base64. Use somente as URLs retornadas.',
    '3. create_post com status DRAFT. Mostre ao usuário: redes, formato, legenda final (captionAsPublished), mídias e data/hora.',
    '4. Após confirmação: schedule_post (agendar) ou publish_post_now (publicar agora, confirm=true).',
    '5. Confira o resultado com get_post. Nunca repita uma publicação de resultado incerto sem checar o status.',
  ],
  formats: {
    IMAGE: 'Uma imagem. Instagram (feed), Facebook (foto da Página), Threads e X.',
    CAROUSEL: 'De 2 a 10 mídias (no X, até 4). Instagram e Threads aceitam imagens e vídeos misturados; o álbum do Facebook aceita somente fotos.',
    REEL: 'Um vídeo. Instagram (Reels), Facebook (vídeo da Página), Threads (vídeo) e X (vídeo).',
    STORY: 'Uma imagem ou vídeo. Somente Instagram.',
    TEXT: 'Somente Threads e/ou X, sem mídia. Até 500 caracteres no Threads e 280 no X.',
  },
  platforms: {
    INSTAGRAM: 'Exige accountId de uma conta do Instagram conectada.',
    FACEBOOK: 'Publica na Página do Facebook vinculada à conta do Instagram (accountId). Stories não são suportados.',
    THREADS: 'Exige threadsAccountId. Mesmo em posts somente para Threads, accountId (Instagram) continua obrigatório.',
    X: 'Exige xAccountId (campo "x" de list_accounts). Texto de até 280 caracteres (com hashtags), até 4 imagens ou 1 vídeo. Cada post consome créditos da API do X do workspace; links no texto custam bem mais — prefira deixar o link na bio. accountId (Instagram) continua obrigatório.',
  },
  limits: {
    caption: 'Até 2.200 caracteres (Instagram). No Threads, texto final de até 500 caracteres; no X, até 280.',
    hashtags: 'Até 30 no campo hashtags (recomendado 3 a 8), sem o símbolo #.',
    media: 'Até 10 mídias por post, 100 MB por arquivo. Formatos: JPG, PNG, WebP, GIF, MP4, MOV. Para Instagram, prefira JPG e vídeo MP4 (H.264/AAC); Reels e Stories em 9:16.',
    mediaUrls: 'Sempre passe as mídias por import_media_from_url ou upload_media_base64: as redes baixam o arquivo de uma URL pública e o InstaCommand reconhece vídeos pela extensão .mp4/.mov que essas ferramentas garantem.',
  },
  hashtags: 'As hashtags do campo hashtags são acrescentadas ao final da legenda (após uma linha em branco) no momento de agendar ou publicar — o mesmo comportamento do compositor. Hashtags já escritas na legenda não são duplicadas. Rascunhos guardam legenda e hashtags separadas.',
  scheduling: [
    `Datas sempre em ISO 8601 com fuso explícito (ex.: 2026-10-10T18:30:00-03:00). Fuso padrão do workspace: ${DEFAULT_TIMEZONE}.`,
    'DRAFT nunca é publicado. scheduledFor de um rascunho define o dia em que ele aparece no calendário.',
    'SCHEDULED é publicado automaticamente pela fila na data escolhida, que precisa estar no futuro.',
    'Para agendar, o post precisa estar completo: mídias corretas para o formato e texto quando for TEXT.',
    'Editar um post agendado mantém o agendamento. unschedule_post devolve para rascunho.',
    'Posts publicados ou em processamento não podem mais ser editados.',
  ],
  instagramAdvanced: {
    altTexts: 'Texto alternativo por mídia, na ordem de mediaUrls (até 1.000 caracteres cada; aplicado às imagens).',
    collaborators: 'Até 3 colaboradores em IMAGE, CAROUSEL ou REEL.',
    firstComment: 'Comentário publicado logo após o post (não vale para STORY).',
    disableComments: 'Desativa comentários (não vale para STORY).',
    userTags: 'Até 20 marcações em IMAGE ou CAROUSEL, com posição x/y de 0 a 1 e o índice da mídia.',
    isAiGenerated: 'Rótulo de conteúdo gerado por IA (somente quando o Instagram está entre as redes).',
    instagramAudio: 'Música da biblioteca do Instagram, somente em REEL publicado no Instagram. Busque com search_instagram_audio.',
  },
  deletion: 'A API oficial do Instagram não permite excluir mídia já publicada: delete_post remove do InstaCommand e tenta excluir no Facebook, no Threads e no X; o post do Instagram precisa ser apagado no app.',
  safety: [
    'Peça confirmação explícita antes de publicar agora, agendar, excluir, responder comentários, enviar mensagens ou desconectar contas.',
    'Conectar contas exige que o usuário abra o link de autorização da Meta, do Threads ou do X no navegador.',
  ],
};
