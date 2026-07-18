import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ServiceWorkerRegistration } from './service-worker-registration';
import './styles.css';

export const metadata: Metadata = {
  description: 'ATLAS AI Friend project scaffold',
  manifest: '/manifest.webmanifest',
  title: 'ATLAS V0.1',
};

export const viewport: Viewport = {
  themeColor: '#17221b',
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
