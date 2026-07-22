'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '../../shared/api';

const personas = [
  ['gentleFriend', 'Бережный друг'],
  ['strictCoach', 'Строгий тренер'],
  ['russianLuli', 'Русские люли'],
  ['glamorousFriend', 'Гламурная подруга'],
  ['analyst', 'Аналитик'],
] as const;

export default function OnboardingPage() {
  const { replace } = useRouter();
  const [timezone, setTimezone] = useState('Asia/Irkutsk');
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [personaId, setPersonaId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiRequest<{ status: string }>('/users/me/onboarding')
      .then((onboarding) => {
        if (active && onboarding.status === 'completed') replace('/today');
      })
      .catch(() => {
        // The technical onboarding remains available when the read is unavailable.
      });
    return () => {
      active = false;
    };
  }, [replace]);

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (noticeAccepted && timezone) setProfileSaved(true);
  }

  return (
    <main>
      <section aria-labelledby="onboarding-title">
        <p className="eyebrow">Onboarding</p>
        <h1 id="onboarding-title">Настроим вашего AI-друга</h1>
        {!profileSaved ? (
          <form onSubmit={saveProfile} className="onboarding-form">
            <label htmlFor="timezone">Часовой пояс</label>
            <input
              id="timezone"
              name="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              required
            />
            <label className="consent">
              <input
                type="checkbox"
                checked={noticeAccepted}
                onChange={(event) => setNoticeAccepted(event.target.checked)}
              />
              Я понимаю, что сервис не заменяет медицинскую помощь.
            </label>
            <button type="submit">Продолжить</button>
          </form>
        ) : !personaId ? (
          <div aria-label="Выбор характера AI" className="persona-grid">
            <h2>Выберите характер</h2>
            {personas.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setPersonaId(id)}>
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div aria-live="polite">
            <h2>Базовая настройка готова</h2>
            <p>Ваше состояние сохранено как personaReady.</p>
          </div>
        )}
      </section>
    </main>
  );
}
