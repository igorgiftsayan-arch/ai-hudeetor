import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: '#f4f1e8',
    description: 'Дневник веса, питания и поддержка AI-друга',
    display: 'standalone',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      {
        src: '/maskable-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
    name: 'ATLAS AI Friend',
    short_name: 'ATLAS',
    id: '/',
    scope: '/',
    start_url: '/today',
    theme_color: '#17221b',
  };
}
