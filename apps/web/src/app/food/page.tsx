'use client';

import { aiFailureMessage } from '../../features/ai-companion/ai-failure-message';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileNavigation } from '../mobile-navigation';
import {
  FoodConfirmation,
  type ConfirmedFoodDraft,
} from '../../features/food/food-confirmation';
import { mergeFoodDeletionStatus } from '../../features/food/food-deletion-state';
import { FoodAnalysisHistory } from '../../features/food/food-analysis-history';
import { FoodDeletion } from '../../features/food/food-deletion';
import { FoodHistoryEntry } from '../../features/food/food-history-entry';
import { FoodPhotoDraft } from '../../features/food/food-photo-draft';
import {
  confirmFoodConsumption,
  createFoodAnalysis,
  loadFoodAnalysis,
  loadFoodDeletionStatus,
  loadFoodScreen,
  prepareFoodImage,
  saveFoodCorrection,
} from '../../features/food/food-api';
import type {
  FoodScreenData,
  FoodDeletionStatus,
} from '../../features/food/food-api';
import { ApiError, apiRequest, newIdempotencyKey } from '../../shared/api';
import {
  ProviderConsentNotice,
  loadProviderConsent,
} from '../../features/ai-companion/provider-consent';
import type { ProviderConsent } from '../../features/ai-companion/provider-consent';
import type { FoodAnalysisResourceDto } from '@atlas/api-contracts';

type ViewState = 'loading' | 'ready' | 'error' | 'onboarding';
type PendingAnalysis = {
  file?: File;
  price?: FoodScreenData['price'];
  idempotencyKey: string;
  uploadedImageId?: string;
};

type PendingConfirmation = {
  analysisId: string;
  idempotencyKey: string;
  consumedAt: string;
  timezone: string;
};
type Recovery = {
  analysisId?: string;
  uploadedImageId?: string;
  idempotencyKey?: string;
  price?: FoodScreenData['price'];
  confirmation?: PendingConfirmation;
};
const photoPolicy = {
  acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxBytes: 10_485_760,
};

export default function FoodPage() {
  const { replace } = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [data, setData] = useState<FoodScreenData>();
  const [providerConsent, setProviderConsent] = useState<ProviderConsent>();
  const [selectedFile, setSelectedFile] = useState<File>();
  const [analysis, setAnalysis] = useState<FoodAnalysisResourceDto>();
  const [deletedAnalysisId, setDeletedAnalysisId] = useState<string>();
  const [confirmedAnalysisIds, setConfirmedAnalysisIds] = useState<string[]>(
    [],
  );
  const [deletionStates, setDeletionStates] = useState<
    Record<string, FoodDeletionStatus>
  >({});
  const [photoRevision, setPhotoRevision] = useState(0);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [historyMessage, setHistoryMessage] = useState<string>();
  const pendingAnalysis = useRef<PendingAnalysis | undefined>(undefined);
  const activeAnalysisId = useRef<string | undefined>(undefined);
  const pendingConfirmation = useRef<PendingConfirmation | undefined>(
    undefined,
  );
  const storageKey = useRef<string | undefined>(undefined);
  const recovery = useRef<Recovery>({});
  const busy = useRef(false);
  const generation = useRef(0);
  const loadSequence = useRef(0);
  const [recoverable, setRecoverable] = useState(false);
  const [pollingPaused, setPollingPaused] = useState(false);
  const [pollRun, setPollRun] = useState(0);

  function persist(next: Recovery) {
    // Persist only operation references, never credentials, images or AI content.
    if (!storageKey.current)
      throw new Error('Не удалось определить владельца разбора.');
    window.sessionStorage.setItem(storageKey.current, JSON.stringify(next));
    recovery.current = next;
  }

  const load = useCallback(async (preserveDraft = false) => {
    const sequence = ++loadSequence.current;
    refreshingRef.current = true;
    setRefreshing(true);
    if (!preserveDraft) setViewState('loading');
    setError(undefined);
    try {
      const [screen, consent, identity] = await Promise.all([
        loadFoodScreen(),
        loadProviderConsent(),
        apiRequest<{ userId: string }>('/users/me'),
      ]);
      if (sequence !== loadSequence.current) return;
      const key = `food-operation:${identity.userId}`;
      if (storageKey.current !== key) {
        generation.current += 1;
        storageKey.current = key;
        pendingAnalysis.current = undefined;
        pendingConfirmation.current = undefined;
        busy.current = false;
        setSelectedFile(undefined);
        setRecoverable(false);
        setStarting(false);
        setConfirming(false);
        setPollingPaused(false);
        setHistoryMessage(undefined);
        setAnalysis(undefined);
        setDeletedAnalysisId(undefined);
        setDeletionStates({});
        setConfirmedAnalysisIds([]);
        setPhotoRevision((value) => value + 1);
        activeAnalysisId.current = undefined;
        const raw = window.sessionStorage.getItem(key);
        recovery.current = raw ? (JSON.parse(raw) as Recovery) : {};
        pendingConfirmation.current = recovery.current.confirmation;
        if (recovery.current.analysisId) {
          activeAnalysisId.current = recovery.current.analysisId;
          const id = recovery.current.analysisId;
          try {
            const current = await loadFoodAnalysis(id);
            if (sequence !== loadSequence.current || storageKey.current !== key)
              return;
            if (current.consumptionStatus === 'consumed') {
              persist({ analysisId: current.id });
              pendingConfirmation.current = undefined;
            }
            setAnalysis(current);
          } catch (cause) {
            if (
              !(cause instanceof ApiError) ||
              cause.code !== 'FOOD_ANALYSIS_NOT_FOUND'
            )
              throw cause;
            const deletion = await loadFoodDeletionStatus(id);
            if (sequence !== loadSequence.current || storageKey.current !== key)
              return;
            if (deletion.analysisStatus !== 'deleted') throw cause;
            setDeletedAnalysisId(id);
            setDeletionStates({ [id]: deletion });
            activeAnalysisId.current = undefined;
            pendingConfirmation.current = undefined;
            persist({ analysisId: id });
          }
        } else if (
          recovery.current.uploadedImageId &&
          recovery.current.idempotencyKey &&
          recovery.current.price
        ) {
          pendingAnalysis.current = {
            uploadedImageId: recovery.current.uploadedImageId,
            idempotencyKey: recovery.current.idempotencyKey,
            price: recovery.current.price,
          };
          setRecoverable(true);
        }
      }
      setData(screen);
      setProviderConsent(consent);
      setViewState('ready');
    } catch (cause) {
      if (sequence !== loadSequence.current) return;
      // A failed restore must be attempted again by the page retry action.
      storageKey.current = undefined;
      if (cause instanceof ApiError && cause.kind === 'session')
        replace('/login');
      else if (cause instanceof ApiError && cause.kind === 'onboarding')
        setViewState('onboarding');
      else setViewState('error');
    } finally {
      if (sequence === loadSequence.current) {
        refreshingRef.current = false;
        setRefreshing(false);
      }
    }
  }, [replace]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      generation.current += 1;
      loadSequence.current += 1;
      activeAnalysisId.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (
      !analysis ||
      !['queued', 'processing', 'outcomeUnknown'].includes(analysis.status)
    )
      return;
    let cancelled = false;
    let timer: number;
    let attempts = 0;
    setPollingPaused(false);
    const check = async () => {
      await pollAnalysis(analysis.id);
      if (cancelled || activeAnalysisId.current !== analysis.id) return;
      attempts += 1;
      if (attempts >= 30) {
        setPollingPaused(true);
        return;
      }
      timer = window.setTimeout(() => void check(), 2_000);
    };
    timer = window.setTimeout(() => void check(), 1_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [analysis?.id, pollRun]);

  function chooseFile(file: File) {
    if (busy.current || recoverable || pendingConfirmation.current) return;
    setDeletedAnalysisId(undefined);
    generation.current += 1;
    persist({});
    setPollingPaused(false);
    setSelectedFile(file);
    setAnalysis(undefined);
    activeAnalysisId.current = undefined;
    setError(undefined);
    pendingAnalysis.current = {
      file,
      idempotencyKey: newIdempotencyKey(),
    };
  }

  async function start() {
    if (refreshingRef.current) return;
    if (!data || busy.current || !canUseFoodAi(providerConsent)) return;
    const pending = pendingAnalysis.current;
    if (!pending) return;
    const version = generation.current;
    busy.current = true;

    setStarting(true);
    setError(undefined);
    try {
      if (!pending.uploadedImageId && pending.file) {
        pending.uploadedImageId = await prepareFoodImage({
          file: pending.file,
          csrfToken: data.csrfToken,
        });
      }
      if (generation.current !== version || !pending.uploadedImageId) return;
      pending.price ??= data.price;
      persist({
        uploadedImageId: pending.uploadedImageId,
        idempotencyKey: pending.idempotencyKey,
        price: pending.price,
      });
      setRecoverable(true);
      const queued = await createFoodAnalysis({
        uploadedImageId: pending.uploadedImageId,
        csrfToken: data.csrfToken,
        idempotencyKey: pending.idempotencyKey,
        price: pending.price,
      });
      if (generation.current !== version) return;
      persist({ analysisId: queued.id });
      setRecoverable(false);
      pendingAnalysis.current = undefined;
      setAnalysis({
        id: queued.id,
        uploadedImageId: pending.uploadedImageId,
        status: queued.status,
        runtimeAdapter: 'pending',
        refundStatus: 'notRefunded',
        consumptionStatus: 'notConfirmed',
        createdAt: new Date().toISOString(),
      });
      activeAnalysisId.current = queued.id;
    } catch (cause) {
      if (generation.current !== version) return;
      if (cause instanceof ApiError && cause.kind === 'session')
        replace('/login');
      else setError(readFoodError(cause));
    } finally {
      if (generation.current === version) {
        busy.current = false;
        setStarting(false);
      }
    }
  }

  async function pollAnalysis(analysisId: string) {
    if (activeAnalysisId.current !== analysisId) return;
    try {
      const current = await loadFoodAnalysis(analysisId);
      if (activeAnalysisId.current !== analysisId) return;
      setAnalysis(current);
      if (!['queued', 'processing', 'outcomeUnknown'].includes(current.status))
        activeAnalysisId.current = undefined;
      if (current.status !== 'outcomeUnknown') setError(undefined);
    } catch (cause) {
      if (activeAnalysisId.current !== analysisId) return;
      if (cause instanceof ApiError && cause.kind === 'session')
        replace('/login');
      else setError('Связь прервалась. Продолжаем проверять статус разбора…');
    }
  }

  async function confirm(draft: ConfirmedFoodDraft) {
    if (!data || !analysis || busy.current) return;
    const version = generation.current;
    busy.current = true;
    setConfirming(true);
    setError(undefined);
    try {
      if (!pendingConfirmation.current) {
        const corrected = await saveFoodCorrection({
          analysisId: analysis.id,
          csrfToken: data.csrfToken,
          correction: { items: draft.items.map((name) => ({ name })) },
        });
        if (generation.current !== version) return;
        setAnalysis(corrected);
        const pending = {
          analysisId: analysis.id,
          idempotencyKey: newIdempotencyKey(),
          consumedAt: new Date(draft.consumedAt).toISOString(),
          timezone: data.timezone,
        };
        persist({ analysisId: analysis.id, confirmation: pending });
        pendingConfirmation.current = pending;
      }
      const pending = pendingConfirmation.current;
      await confirmFoodConsumption({
        ...pending,
        csrfToken: data.csrfToken,
      });
      if (generation.current !== version) return;
      persist({ analysisId: analysis.id });
      pendingConfirmation.current = undefined;
      setConfirmedAnalysisIds((previous) => [
        ...new Set([...previous, analysis.id]),
      ]);
      setAnalysis((current) =>
        current ? { ...current, consumptionStatus: 'consumed' } : current,
      );
      await load();
    } catch (cause) {
      if (generation.current !== version) return;
      if (cause instanceof ApiError && cause.kind === 'session')
        replace('/login');
      else setError(readFoodError(cause));
    } finally {
      if (generation.current === version) {
        busy.current = false;
        setConfirming(false);
      }
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

  function deletionChanged(status: FoodDeletionStatus) {
    setDeletionStates((previous) => ({
      ...previous,
      [status.analysisId]: mergeFoodDeletionStatus(
        previous[status.analysisId],
        status,
      ),
    }));
    if (status.analysisId !== (analysis?.id ?? deletedAnalysisId)) return;
    if (status.photoStatus !== 'available') {
      setSelectedFile(undefined);
      setPhotoRevision((value) => value + 1);
    }
    if (status.cancellationStatus === 'cancelledRefunded') {
      setError(undefined);
      activeAnalysisId.current = undefined;
      setAnalysis((current) =>
        current ? { ...current, status: 'cancelled' } : current,
      );
    }
    if (status.analysisStatus === 'deleted') {
      setError(undefined);
      generation.current += 1;
      activeAnalysisId.current = undefined;
      pendingConfirmation.current = undefined;
      setAnalysis(undefined);
      setSelectedFile(undefined);
      setDeletedAnalysisId(status.analysisId);
      setPhotoRevision((value) => value + 1);
      persist({ analysisId: status.analysisId });
    }
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

        <fieldset
          disabled={
            refreshing ||
            starting ||
            recoverable ||
            confirming ||
            Boolean(pendingConfirmation.current)
          }
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <FoodPhotoDraft
            key={photoRevision}
            policy={photoPolicy}
            onReady={chooseFile}
          />
        </fieldset>

        {(selectedFile || recoverable) && !analysis && (
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
                feature="food"
                consent={providerConsent}
                csrfToken={data.csrfToken}
                disclosure="Фото блюда и необходимый контекст будут переданы внешнему сервису GenAPI для разбора."
                onAccepted={() => load(true)}
                onSessionExpired={() => replace('/login')}
              />
            )}
            <button
              type="button"
              className="food-primary-action"
              disabled={refreshing || starting || !canUseFoodAi(providerConsent)}
              onClick={() => void start()}
            >
              {starting
                ? 'Отправляем фото…'
                : recoverable
                  ? 'Восстановить отправленный разбор'
                  : 'Начать анализ'}
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
            <fieldset
              disabled={confirming || Boolean(pendingConfirmation.current)}
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              <FoodConfirmation
                key={analysis.id}
                analysis={analysisView}
                now={localDateTimeInputValue(data.timezone)}
                status={
                  analysis.consumptionStatus === 'consumed'
                    ? 'confirmed'
                    : 'unconfirmed'
                }
                onConfirm={(draft) => void confirm(draft)}
              />
            </fieldset>
            {pendingConfirmation.current &&
              !confirming &&
              analysis.consumptionStatus !== 'consumed' && (
                <button
                  type="button"
                  onClick={() => void confirm({ items: [], consumedAt: '' })}
                >
                  Повторить подтверждение
                </button>
              )}
            {confirming && (
              <p className="food-draft-pending" aria-live="polite">
                Подтверждаем запись…
              </p>
            )}
          </>
        )}

        {analysis?.status === 'technicalError' && (
          <section className="food-analysis-progress" role="alert">
            <p>
              {aiFailureMessage('food', analysis.errorCategory, analysis.refundStatus)}
            </p>
          </section>
        )}
        {analysis?.status === 'outcomeUnknown' && (
          <section className="food-analysis-progress" role="alert">
            <p>Статус разбора уточняется. Не отправляйте фото повторно.</p>
          </section>
        )}
        {pollingPaused &&
          analysis &&
          ['queued', 'processing', 'outcomeUnknown'].includes(
            analysis.status,
          ) && (
            <button
              type="button"
              onClick={() => {
                activeAnalysisId.current = analysis.id;
                setPollRun((run) => run + 1);
              }}
            >
              Проверить статус
            </button>
          )}
        {(deletedAnalysisId ||
          (analysis &&
            [
              'analyzed',
              'technicalError',
              'queued',
              'processing',
              'outcomeUnknown',
              'cancelled',
            ].includes(analysis.status))) &&
          storageKey.current && (
            <FoodDeletion
              key={`${storageKey.current}:${analysis?.id ?? deletedAnalysisId}`}
              analysisId={(analysis?.id ?? deletedAnalysisId)!}
              ownerScope={storageKey.current}
              csrfToken={data.csrfToken}
              onSessionExpired={() => replace('/login')}
              onStatus={deletionChanged}
              mayCancel={Boolean(
                analysis &&
                ['queued', 'processing', 'outcomeUnknown'].includes(
                  analysis.status,
                ),
              )}
              disabled={confirming || Boolean(pendingConfirmation.current)}
            />
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
          {historyMessage && <p role="status">{historyMessage}</p>}
          {data.consumptions.length === 0 ? (
            <p>Здесь появится только подтверждённая еда.</p>
          ) : (
            <ol aria-label="Подтверждённые записи питания">
              {data.consumptions.map((consumption) => (
                <FoodHistoryEntry
                  key={`${storageKey.current}:${consumption.id}`}
                  consumption={consumption}
                  ownerScope={storageKey.current}
                  onDeletionStatus={deletionChanged}
                  csrfToken={data.csrfToken}
                  onSessionExpired={() => replace('/login')}
                  onChanged={async (message) => {
                    setData(await loadFoodScreen());
                    setHistoryMessage(message);
                  }}
                />
              ))}
            </ol>
          )}
        </section>
        {storageKey.current && (
          <FoodAnalysisHistory
            key={storageKey.current}
            ownerScope={storageKey.current}
            csrfToken={data.csrfToken}
            timezone={data.timezone}
            onSessionExpired={() => replace('/login')}
            onDeletionStatus={deletionChanged}
            deletionStates={deletionStates}
            confirmedAnalysisIds={[
              ...confirmedAnalysisIds,
              ...data.consumptions.map((item) => item.foodAnalysisId),
            ]}
          />
        )}
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
  const assessedItems =
    analysis.recognizedResult?.items.map((item) => item.name) ?? [];
  const source =
    suitability?.source === 'profile'
      ? 'Оценка основана на сохранённом профиле.'
      : suitability?.source === 'gerbiProgram'
        ? 'Оценка основана на программе «Герби».'
        : '';
  return {
    items: recognized.items.map((item) => item.name),
    assessedItems,
    suitabilityStatus: suitability?.status ?? ('insufficientData' as const),
    missingData: suitability?.missingData ?? [],
    suitability: suitability
      ? [source, ...suitability.observations].filter(Boolean).join(' ')
      : 'Оценка этого блюда пока недоступна.',
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
  return consent.foodExternalProviderEnabled === false || consent.accepted;
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
