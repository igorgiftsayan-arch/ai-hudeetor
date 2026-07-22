import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ServiceWorkerRegistration } from './service-worker-registration';
import './styles.css';

export const metadata: Metadata = {
  description: 'Спокойный дневник веса и AI-поддержка',
  manifest: '/manifest.webmanifest',
  title: 'Сегодня — дневник веса',
};

export const viewport: Viewport = {
  themeColor: '#f3efe5',
  width: 'device-width',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
