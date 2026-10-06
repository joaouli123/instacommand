/** True for links to video files (also Meta CDN links, whose path ends in .mp4 before the signed query). */
export const isVideoUrl = (src: string) => /\.(mp4|m4v|mov|webm|ogv|ogg)(?:[?#].*)?$/i.test(src)
