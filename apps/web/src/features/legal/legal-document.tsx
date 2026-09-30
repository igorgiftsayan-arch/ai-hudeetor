import type { ReactNode } from 'react';

type LegalDocumentProps = {
  children: ReactNode;
  title: string;
  version: string;
};

export function LegalDocument({
  children,
  title,
  version,
}: LegalDocumentProps) {
  return (
    <main className="legal-shell">
      <article className="legal-document" aria-labelledby="legal-title">
        <p className="section-label">Rebody</p>
        <h1 id="legal-title">{title}</h1>
        <p className="legal-version">Версия: {version}</p>
        {children}
      </article>
    </main>
  );
}
