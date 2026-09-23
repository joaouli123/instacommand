/** Turn common Meta permission failures into actionable, user-facing explanations. */
export const publicMetaMessage = (message: string) => {
  const normalized = message.toLowerCase();

  if (normalized.includes('instagram public content access')) {
    return 'A busca pública de hashtags depende da aprovação do Instagram Public Content Access pela Meta. Isso não bloqueia a publicação; você ainda pode informar hashtags manualmente.';
  }

  if (normalized.includes('pages_manage_posts') || normalized.includes('publish_to_groups')) {
    return 'A Meta recusou a publicação na Página do Facebook por falta da permissão pages_manage_posts. O administrador precisa habilitar essa permissão na configuração de Login da Meta e obter a aprovação exigida; depois, reconecte a conta. A publicação nas outras redes pode ter sido concluída.';
  }

  return message;
};
