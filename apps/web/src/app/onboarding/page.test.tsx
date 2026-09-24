import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingPage from './page';

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: replaceMock }) }));
const state = (status = 'registered') => ({ status, csrfToken: 'csrf-token', aiWellnessNoticeVersion: 'notice-current' });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('persisted onboarding', () => {
  beforeEach(() => replaceMock.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it('saves profile and persona before explicit completion and navigation', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method) return json(state());
      if (url.endsWith('/profile')) return json({ onboardingStatus: 'profileReady' });
      if (url.endsWith('/ai-preference')) return json({ onboardingStatus: 'personaReady' });
      return json({ onboardingStatus: 'completed', starterTokensGranted: 100, tokenBalance: 100 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<OnboardingPage />);
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await user.click(await screen.findByRole('button', { name: 'Бережный друг' }));
    expect(replaceMock).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Открыть дневник' }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/today'));
    const mutations = fetchMock.mock.calls.filter(([, init]) => init?.method);
    expect(mutations.map(([url, init]) => [url, init?.method])).toEqual([
      ['/api/v1/users/me/profile', 'PATCH'], ['/api/v1/users/me/ai-preference', 'PUT'], ['/api/v1/users/me/onboarding-completions', 'POST'],
    ]);
    expect(JSON.parse(String(mutations[0]?.[1]?.body))).toEqual({ timezone: 'Asia/Irkutsk', consents: [{ consentType: 'aiWellnessNotice', documentVersion: 'notice-current', accepted: true }] });
    expect(JSON.parse(String(mutations[1]?.[1]?.body))).toEqual({ personaId: 'gentleFriend' });
    expect(new Headers(mutations[2]?.[1]?.headers).get('X-CSRF-Token')).toBe('csrf-token');
  });

  it('retries a lost completion response with the same key without repeating setup', async () => {
    let posts = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return json(state('personaReady'));
      if (++posts === 1) throw new Error('lost response');
      return json({ onboardingStatus: 'completed' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<OnboardingPage />);
    await user.click(await screen.findByRole('button', { name: 'Открыть дневник' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Открыть дневник' }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/today'));
    const writes = fetchMock.mock.calls.filter(([, init]) => init?.method);
    expect(writes).toHaveLength(2);
    expect(new Headers(writes[0]?.[1]?.headers).get('Idempotency-Key')).toBe(new Headers(writes[1]?.[1]?.headers).get('Idempotency-Key'));
  });

  it('prevents concurrent completion submissions while waiting for acknowledgement', async () => {
    let resolve!: (value: Response) => void;
    const pending = new Promise<Response>((done) => { resolve = done; });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method ? pending : json(state('personaReady')));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<OnboardingPage />);
    await user.dblClick(await screen.findByRole('button', { name: 'Открыть дневник' }));
    expect(screen.getByRole('button', { name: 'Завершаем настройку…' })).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method)).toHaveLength(1);
    expect(replaceMock).not.toHaveBeenCalled();
    resolve(json({ onboardingStatus: 'completed' }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/today'));
  });

  it('restores completed state after reload without granting again', async () => {
    const fetchMock = vi.fn(async () => json(state('completed')));
    vi.stubGlobal('fetch', fetchMock);
    render(<OnboardingPage />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/today'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps failed profile save on the same step', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return json(state());
      throw new Error('offline');
    }));
    const user = userEvent.setup();
    render(<OnboardingPage />);
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Бережный друг' })).not.toBeInTheDocument();
  });

  it('offers retry when initial state cannot be read instead of permitting blind writes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(json(state('profileReady'))));
    const user = userEvent.setup();
    render(<OnboardingPage />);
    await user.click(await screen.findByRole('button', { name: 'Повторить загрузку' }));
    expect(await screen.findByRole('button', { name: 'Бережный друг' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
