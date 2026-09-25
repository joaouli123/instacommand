/** Turn common Meta permission failures into actionable, user-facing explanations. */
export const publicMetaMessage = (message: string) => {
  const normalized = message.toLowerCase();

  if (normalized.includes('instagram public content access')) {
    return 'A busca pública de hashtags depende da aprovação do Instagram Public Content Access pela Meta. Isso não bloqueia a publicação; você ainda pode informar hashtags manualmente.';
  }

  if (normalized.includes('pages_manage_posts') || normalized.includes('publish_to_groups')) {
    return 'A Meta recusou a publicação na Página do Facebook por falta da permissão pages_manage_posts. O administrador precisa habilitar essa permissão na configuração de Login da Meta e obter a aprovação exigida; depois, reconecte a conta. A publicação nas outras redes pode ter sido concluída.';
  }

  if (normalized.includes('nenhum post foi enviado')) {
    return 'A Meta ainda não liberou o controle de comentários para este sistema. O administrador precisa pedir aprovação e reconectar a conta; nenhum post foi enviado ao Instagram.';
  }

  if (normalized.includes('instagram_manage_comments')) {
    return 'A Meta recusou a ação de comentários. O administrador precisa solicitar a permissão específica e reconectar a conta.';
  }

  if (normalized.includes('comment') || normalized.includes('coment')) {
    return 'O post foi publicado, mas o ajuste de comentários não foi concluído. Confira as permissões da Meta ou faça esse ajuste manualmente no Instagram.';
  }

  return message;
};
