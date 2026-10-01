'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (window.isSecureContext && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // The notifications screen reports registration/TLS failures on explicit opt-in.
      });
    }
  }, []);

  return null;
}
