type MetaMedia = { media_type?: unknown; media_url?: unknown; thumbnail_url?: unknown };

const asUrl = (value: unknown) => (typeof value === 'string' && value ? value : null);

export const isVideoFileUrl = (url: string | null | undefined) => {
  if (!url) return false;
  try { return /\.(mp4|m4v|mov|webm)$/i.test(new URL(url).pathname); } catch { return false; }
};

/**
 * URL to show as a still preview of Instagram media. For videos (Reels, video
 * Stories, a carousel whose cover is a video) Meta's `media_url` is the .mp4
 * file, which an <img> can never render; its `thumbnail_url` is the cover.
 * The video file is kept only as a last resort when no cover exists.
 */
export function mediaPreviewUrl(item: MetaMedia): string | null {
  const mediaUrl = asUrl(item.media_url);
  const thumbnailUrl = asUrl(item.thumbnail_url);
  if (item.media_type === 'VIDEO' || isVideoFileUrl(mediaUrl)) return thumbnailUrl || mediaUrl;
  return mediaUrl || thumbnailUrl;
}
