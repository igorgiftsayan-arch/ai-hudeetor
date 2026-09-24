'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileNavigation } from '../mobile-navigation';
import {
  FoodConfirmation,
  type ConfirmedFoodDraft,
} from '../../features/food/food-confirmation';
import { FoodPhotoDraft } from '../../features/food/food-photo-draft';
import {
  confirmFoodConsumption,
  createFoodAnalysis,
  loadFoodAnalysis,
  loadFoodScreen,
  prepareFoodImage,
  saveFoodCorrection,
} from '../../features/food/food-api';
import type { FoodScreenData } from '../../features/food/food-api';
import { ApiError, newIdempotencyKey } from '../../shared/api';
import {
  ProviderConsentNotice,
  loadProviderConsent,
} from '../../features/ai-companion/provider-consent';
import type { ProviderConsent } from '../../features/ai-companion/provider-consent';
import type { FoodAnalysisResourceDto } from '@atlas/api-contracts';

type ViewState = 'loading' | 'ready' | 'error' | 'onboarding';
type PendingAnalysis = {
  file: File;
  idempotencyKey: string;
  uploadedImageId?: string;
};

const photoPolicy = {
  acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxBytes: 10_485_760,
};

export default function FoodPage() {
  const { replace } = useRouter();
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [data, setData] = useState<FoodScreenData>();
  const [providerConsent, setProviderConsent] = useState<ProviderConsent>();
  const [selectedFile, setSelectedFile] = useState<File>();
  const [analysis, setAnalysis] = useState<FoodAnalysisResourceDto>();
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const pendingAnalysis = useRef<PendingAnalysis | undefined>(undefined);
  const pendingConfirmation = useRef<
    { payload: string; idempotencyKey: string } | undefined
  >(undefined);

  const load = useCallback(async () => {
    setViewState('loading');
    setError(undefined);
    try {
      const [screen, consent] = await Promise.all([
        loadFoodScreen(),
        loadProviderConsent(),
      ]);
      setData(screen);
      setProviderConsent(consent);
      setViewState('ready');
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session')
        replace('/login');
      else if (cause instanceof ApiError && cause.kind === 'onboarding')
        setViewState('onboarding');
      else setViewState('error');
    }
  }, [replace]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!analysis || !['queued', 'processing'].includes(analysis.status))
      return;
    const timer = window.setInterval(
      () => void pollAnalysis(analysis.id),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [analysis?.id, analysis?.status]);

  function chooseFile(file: File) {
    setSelectedFile(file);
    setAnalysis(undefined);
    setError(undefined);
    pendingAnalysis.current = {
      file,
      idempotencyKey: newIdempotencyKey(),
    };
  }

  async function start() {
    if (!data || !selectedFile || !canUseFoodAi(providerConsent)) return;
    const pending = pendingAnalysis.current;
    if (!pending || pending.file !== selectedFile) return;

    setStarting(true);
    setError(undefined);
    try {
      pending.uploadedImageId ??= await prepareFoodImage({
        file: pending.file,
        csrfToken: data.csrfToken,
      });
      const queued = await createFoodAnalysis({
        uploadedImageId: pending.uploadedImageId,
        csrfToken: data.csrfToken,
        idempotencyKey: pending.idempotencyKey,
        price: data.price,
      });
      pendingAnalysis.current = undefined;
      setAnalysis({
        id: queued.id,
        uploadedImageId: pending.uploadedImageId,
        status: queued.status,
        runtimeAdapter: 'pending',
        consumptionStatus: 'notConfirmed',
        createdAt: new Date().toISOString(),
      });
      await pollAnalysis(queued.id);
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session')
        replace('/login');
      else setError(readFoodError(cause));
    } finally {
      setStarting(false);
    }
  }

  async function pollAnalysis(analysisId: string) {
    try {
      const current = await loadFoodAnalysis(analysisId);
      setAnalysis(current);
      if (current.status !== 'outcomeUnknown') setError(undefined);
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session')
        replace('/login');
      else setError('Связь прервалась. Продолжаем проверять статус разбора…');
    }
  }

  async function confirm(draft: ConfirmedFoodDraft) {
    if (!data || !analysis) return;
    const consumedAt = new Date(draft.consumedAt).toISOString();
    const payload = JSON.stringify({
      analysisId: analysis.id,
      consumedAt,
      timezone: data.timezone,
    });
    if (pendingConfirmation.current?.payload !== payload) {
      pendingConfirmation.current = {
        payload,
        idempotencyKey: newIdempotencyKey(),
      };
    }
    setConfirming(true);
    setError(undefined);
    try {
      await saveFoodCorrection({
        analysisId: analysis.id,
        csrfToken: data.csrfToken,
        correction: { items: draft.items.map((name) => ({ name })) },
      });
      await confirmFoodConsumption({
        analysisId: analysis.id,
        csrfToken: data.csrfToken,
        idempotencyKey: pendingConfirmation.current.idempotencyKey,
        consumedAt,
        timezone: data.timezone,
      });
      pendingConfirmation.current = undefined;
      setAnalysis((current) =>
        current ? { ...current, consumptionStatus: 'consumed' } : current,
      );
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session')
        replace('/login');
      else setError(readFoodError(cause));
    } finally {
      setConfirming(false);
    }
  }

  if (viewState !== 'ready' || !data) {
    return (
      <FoodBoundary
        state={viewState === 'ready' ? 'error' : viewState}
        onRetry={load}
      />
    );
  }

  const analysisView = analysisToView(analysis);
  const waiting =
    analysis && ['queued', 'processing'].includes(analysis.status);

  return (
    <main className="app-shell food-shell">
      <div className="app-page food-page">
        <header className="food-page-header">
          <p className="section-label">Без догадок</p>
          <h1>Фото блюда</h1>
          <p>
            Сначала разбор. В дневник попадёт только то, что вы подтвердите.
          </p>
        </header>

        <FoodPhotoDraft policy={photoPolicy} onReady={chooseFile} />

        {selectedFile && !analysis && (
          <section
            className="food-analysis-start"
            aria-labelledby="food-analysis-start-title"
          >
            <div>
              <p className="marathon-kicker">Перед разбором</p>
              <h2 id="food-analysis-start-title">Анализ фото</h2>
              <p>
                Стоимость: {tokenLabel(data.price.tokenPrice)}. Фото не станет
                записью питания автоматически.
              </p>
            </div>
            {providerConsent && (
              <ProviderConsentNotice
                consent={providerConsent}
                csrfToken={data.csrfToken}
                disclosure="Фото блюда и необходимый контекст будут переданы внешнему сервису GenAPI для разбора."
                onAccepted={load}
                onSessionExpired={() => replace('/login')}
              />
            )}
            <button
              type="button"
              className="food-primary-action"
              disabled={starting || !canUseFoodAi(providerConsent)}
              onClick={() => void start()}
            >
              {starting ? 'Отправляем фото…' : 'Начать анализ'}
            </button>
          </section>
        )}

        {waiting && (
          <section className="food-analysis-progress" aria-live="polite">
            <p className="marathon-kicker">Разбор фото</p>
            <p>Проверяем изображение и готовим результат…</p>
          </section>
        )}

        {analysis?.status === 'analyzed' && analysisView && (
          <>
            {analysis.runtimeAdapter === 'fake' && (
              <p className="runtime-notice">
                Тестовый режим: это демонстрационный результат, а не реальное
                распознавание.
              </p>
            )}
            <FoodConfirmation
              analysis={analysisView}
              now={localDateTimeInputValue(data.timezone)}
              status={
                analysis.consumptionStatus === 'consumed'
                  ? 'confirmed'
                  : 'unconfirmed'
              }
              onConfirm={(draft) => void confirm(draft)}
            />
            {confirming && (
              <p className="food-draft-pending" aria-live="polite">
                Подтверждаем запись…
              </p>
            )}
          </>
        )}

        {analysis?.status === 'technicalError' && (
          <section className="food-analysis-progress" role="alert">
            <p>Разбор не завершился. Зарезервированные токены возвращены.</p>
          </section>
        )}
        {analysis?.status === 'outcomeUnknown' && (
          <section className="food-analysis-progress" role="alert">
            <p>Статус разбора уточняется. Не отправляйте фото повторно.</p>
          </section>
        )}
        {error && (
          <p className="food-draft-error" role="alert">
            {error}
          </p>
        )}

        <section className="food-history" aria-labelledby="food-history-title">
          <div>
            <p className="section-label">Дневник питания</p>
            <h2 id="food-history-title">Подтверждённые записи</h2>
          </div>
          {data.consumptions.length === 0 ? (
            <p>Здесь появится только подтверждённая еда.</p>
          ) : (
            <ol aria-label="Подтверждённые записи питания">
              {data.consumptions.map((consumption) => (
                <li key={consumption.id}>
                  <time dateTime={consumption.consumedAt}>
                    {consumption.localDate}
                  </time>
                  <strong>
                    {consumption.confirmedResult.items
                      .map((item) => item.name)
                      .join(', ')}
                  </strong>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      <MobileNavigation active="food" />
    </main>
  );
}

function analysisToView(analysis: FoodAnalysisResourceDto | undefined) {
  if (!analysis) return undefined;
  const recognized = analysis.userCorrection ?? analysis.recognizedResult;
  if (!recognized) return undefined;
  const suitability = analysis.suitabilityResult;
  if (!suitability || suitability.status === 'insufficientData') {
    return {
      items: recognized.items.map((item) => item.name),
      suitability:
        'Пока не хватает известных целей или ограничений питания для оценки этого блюда.',
    };
  }
  const source =
    suitability.source === 'profile'
      ? 'Оценка основана на сохранённом профиле.'
      : '';
  return {
    items: recognized.items.map((item) => item.name),
    suitability: [
      source,
      ...suitability.observations,
      ...suitability.missingData,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function localDateTimeInputValue(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function tokenLabel(count: number) {
  return `${count} ${count === 1 ? 'токен' : 'токена'}`;
}

function canUseFoodAi(consent: ProviderConsent | undefined) {
  if (!consent) return false;
  return (
    consent.providerMode === 'fake' ||
    !consent.externalProviderEnabled ||
    consent.accepted
  );
}

function readFoodError(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : 'Не удалось продолжить. Попробуйте ещё раз.';
}

function FoodBoundary({
  state,
  onRetry,
}: {
  state: Exclude<ViewState, 'ready'>;
  onRetry: () => Promise<void>;
}) {
  return (
    <main className="app-shell food-shell">
      <div className="app-page boundary-page">
        {state === 'loading' && (
          <p className="loading-state">Открываем дневник питания…</p>
        )}
        {state === 'error' && (
          <div className="boundary-message" role="alert">
            <h1>Не удалось открыть дневник</h1>
            <button
              type="button"
              className="primary-action"
              onClick={() => void onRetry()}
            >
              Попробовать снова
            </button>
          </div>
        )}
        {state === 'onboarding' && (
          <div className="boundary-message">
            <h1>Завершите настройку</h1>
            <a href="/onboarding">К настройке</a>
          </div>
        )}
      </div>
    </main>
  );
}
