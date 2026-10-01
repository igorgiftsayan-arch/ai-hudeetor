import type {
  CaptainTaskDto,
  CaptainTaskResponseDto,
  CurrentMarathonDto,
  EmptyMarathonCommandDto,
  MarathonEnrollmentClosedDto,
  MarathonEnrollmentCreatedDto,
  MarathonLobbyDto,
  MarathonMembershipCreatedDto,
  MarathonStartedDto,
  OpenMarathonEnrollmentDto,
  OnboardingResourceDto,
  TaskCompletionDto,
  TaskCompletionResponseDto,
  TeamTodayDto,
  WellnessReportDto,
  WellnessReportReadDto,
  WellnessReportSavedDto,
} from '@atlas/api-contracts';
import { ApiError, apiRequest, mutationHeaders } from '../../shared/api';
import { loadProviderConsent } from '../ai-companion/provider-consent';
import type { ProviderConsent } from '../ai-companion/provider-consent';

export type { ProviderConsent } from '../ai-companion/provider-consent';

export type WellnessValues = WellnessReportDto;
export type WellnessReport = WellnessReportReadDto;
export type MarathonCurrent = CurrentMarathonDto;

export type MarathonTeamToday = TeamTodayDto;

export type MarathonFinale = {
  marathonId: string;
  endsOn: string;
  membershipId: string;
  role: 'captain' | 'participant';
};

export type MarathonLobbyData = MarathonLobbyDto & {
  finale?: MarathonFinale | null;
};

export type MarathonLobbyScreenData = {
  csrfToken: string;
  lobby: MarathonLobbyData;
};

export type MarathonScreenData = {
  csrfToken: string;
  current: MarathonCurrent;
  report: WellnessReport;
  team: MarathonTeamToday;
  consent: ProviderConsent;
};

export type MarathonCompletionScreenData = Pick<
  MarathonScreenData,
  'csrfToken' | 'current' | 'report'
>;

function withMarathonScope(path: string, marathonId?: string) {
  return marathonId ? `${path}?marathonId=${encodeURIComponent(marathonId)}` : path;
}

export async function loadMarathonScreen(): Promise<MarathonScreenData> {
  const onboarding = await apiRequest<OnboardingResourceDto>('/users/me/onboarding');
  if (onboarding.status !== 'completed') {
    throw new ApiError('onboarding', 'Завершите настройку, чтобы открыть марафон.');
  }
  const current = await apiRequest<MarathonCurrent>('/marathons/current');
  const [report, team, consent] = await Promise.all([
    apiRequest<WellnessReport>(`/marathon-wellness-reports/${current.reportDate}`),
    apiRequest<TeamTodayDto>('/marathon-teams/current/today'),
    loadProviderConsent(),
  ]);
  return { csrfToken: onboarding.csrfToken, current, report, team, consent };
}

export async function loadMarathonCompletionScreen(
  csrfToken: string,
  marathonId: string,
): Promise<MarathonCompletionScreenData> {
  const current = await apiRequest<MarathonCurrent>(
    withMarathonScope('/marathons/current', marathonId),
  );
  const report = await apiRequest<WellnessReport>(
    withMarathonScope(
      `/marathon-wellness-reports/${current.reportDate}`,
      marathonId,
    ),
  );
  return { csrfToken, current, report };
}

export async function loadMarathonLobbyScreen(): Promise<MarathonLobbyScreenData> {
  const onboarding = await apiRequest<OnboardingResourceDto>('/users/me/onboarding');
  if (onboarding.status !== 'completed') {
    throw new ApiError('onboarding', 'Завершите настройку, чтобы открыть марафон.');
  }
  const lobby = await apiRequest<MarathonLobbyData>('/marathons/lobby');
  return { csrfToken: onboarding.csrfToken, lobby };
}

export function openMarathonEnrollment(input: {
  durationDays: number;
  csrfToken: string;
  idempotencyKey: string;
}) {
  const payload: OpenMarathonEnrollmentDto = { durationDays: input.durationDays };
  return apiRequest<MarathonEnrollmentCreatedDto>('/marathons/enrollment', {
    method: 'POST',
    headers: mutationHeaders(input.csrfToken, input.idempotencyKey),
    body: JSON.stringify(payload),
  });
}

export function joinMarathonEnrollment(input: {
  marathonId: string;
  csrfToken: string;
  idempotencyKey: string;
}) {
  const payload: EmptyMarathonCommandDto = {};
  return apiRequest<MarathonMembershipCreatedDto>(
    `/marathons/${input.marathonId}/memberships`,
    {
    method: 'POST',
    headers: mutationHeaders(input.csrfToken, input.idempotencyKey),
    body: JSON.stringify(payload),
    },
  );
}

export function closeMarathonEnrollment(input: {
  marathonId: string;
  csrfToken: string;
  idempotencyKey: string;
}) {
  const payload: EmptyMarathonCommandDto = {};
  return apiRequest<MarathonEnrollmentClosedDto>(
    `/marathons/${input.marathonId}/enrollment-close`,
    {
      method: 'POST',
      headers: mutationHeaders(input.csrfToken, input.idempotencyKey),
      body: JSON.stringify(payload),
    },
  );
}

export function startMarathon(input: {
  marathonId: string;
  csrfToken: string;
  idempotencyKey: string;
}) {
  const payload: EmptyMarathonCommandDto = {};
  return apiRequest<MarathonStartedDto>(`/marathons/${input.marathonId}/start`, {
    method: 'POST',
    headers: mutationHeaders(input.csrfToken, input.idempotencyKey),
    body: JSON.stringify(payload),
  });
}

export function saveWellnessReport(input: {
  reportDate: string;
  values: WellnessValues;
  csrfToken: string;
  idempotencyKey: string;
  marathonId?: string;
}) {
  return apiRequest<WellnessReportSavedDto>(
    withMarathonScope(
      `/marathon-wellness-reports/${input.reportDate}`,
      input.marathonId,
    ),
    {
      method: 'PUT',
      headers: mutationHeaders(input.csrfToken, input.idempotencyKey),
      body: JSON.stringify(input.values),
    },
  );
}

export function completeCaptainTask(input: {
  taskId: string;
  completed: boolean;
  csrfToken: string;
  idempotencyKey: string;
}) {
  const payload: TaskCompletionDto = { completed: input.completed };
  return apiRequest<TaskCompletionResponseDto>(`/marathon-captain-tasks/${input.taskId}/completion`, {
    method: 'PUT',
    headers: mutationHeaders(input.csrfToken, input.idempotencyKey),
    body: JSON.stringify(payload),
  });
}

export function saveCaptainTask(input: {
  taskDate: string;
  title: string;
  description: string;
  csrfToken: string;
  idempotencyKey: string;
}) {
  const payload: CaptainTaskDto = { title: input.title, description: input.description };
  return apiRequest<CaptainTaskResponseDto>(`/marathon-captain-tasks/${input.taskDate}`, {
    method: 'PUT',
    headers: mutationHeaders(input.csrfToken, input.idempotencyKey),
    body: JSON.stringify(payload),
  });
}
