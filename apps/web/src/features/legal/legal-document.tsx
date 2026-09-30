import type { ReactNode } from 'react';

type LegalDocumentProps = {
  children: ReactNode;
  title: string;
  version: string | undefined;
};

export function LegalDocument({
  children,
  title,
  version,
}: LegalDocumentProps) {
  return (
    <main className="legal-shell">
      <article className="legal-document" aria-labelledby="legal-title">
        <p className="section-label">Черновик для проверки — не опубликован</p>
        <h1 id="legal-title">{title}</h1>
        <p className="legal-version">
          Версия: {version ?? 'не настроена для публикации'}
        </p>
        <p className="legal-notice">
          В этом тексте намеренно оставлены непроверенные реквизиты и каналы
          связи. До их заполнения документ нельзя использовать для публичной
          регистрации.
        </p>
        {children}
      </article>
    </main>
  );
}
