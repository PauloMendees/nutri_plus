// Vídeo "Introdução ao iNutri" (canal do iNutri no YouTube), usado na
// apresentação de primeiros passos e no topo da página de Tutoriais.
export const INTRO_VIDEO = {
  youtubeId: 'lN8bnCbW1J0',
  title: 'Introdução ao iNutri',
  duration: '2:45',
} as const;

// youtube-nocookie: o YouTube só grava cookies depois que a pessoa dá play.
export const INTRO_VIDEO_EMBED_URL = `https://www.youtube-nocookie.com/embed/${INTRO_VIDEO.youtubeId}?autoplay=1&rel=0&modestbranding=1`;

export const INTRO_VIDEO_THUMBNAIL_URL = `https://i.ytimg.com/vi/${INTRO_VIDEO.youtubeId}/hqdefault.jpg`;
