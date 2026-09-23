import type {
  CaptainTaskDto,
  CaptainTaskResponseDto,
  CurrentMarathonDto,
  JoinMarathonDto,
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
export type WellnessReportUnavailable = {
  status: 'unavailable';
  reportDate: string;
};
export type MarathonCurrent = CurrentMarathonDto;

export type MarathonTeamToday = TeamTodayDto;

export type MarathonScreenData = {
  csrfToken: string;
  current: MarathonCurrent;
  report: WellnessReport | WellnessReportUnavailable;
  team: MarathonTeamToday;
  consent: ProviderConsent;
};

export async function loadMarathonScreen(): Promise<MarathonScreenData> {
  const onboarding = await apiRequest<OnboardingResourceDto>('/users/me/onboarding');
  if (onboarding.status !== 'completed') {
    throw new ApiError('onboarding', 'Завершите настройку, чтобы открыть марафон.');
  }
  const current = await apiRequest<MarathonCurrent>('/marathons/current');
  const report = apiRequest<WellnessReport>(
    `/marathon-wellness-reports/${current.reportDate}`,
  ).catch((cause): WellnessReport | WellnessReportUnavailable => {
    if (cause instanceof ApiError && cause.code === 'MARATHON_REPORT_DATE_INVALID') {
      return { status: 'unavailable', reportDate: current.reportDate };
    }
    throw cause;
  });
  const [resolvedReport, team, consent] = await Promise.all([
    report,
    apiRequest<TeamTodayDto>('/marathon-teams/current/today'),
    loadProviderConsent(),
  ]);
  return { csrfToken: onboarding.csrfToken, current, report: resolvedReport, team, consent };
}

export function joinMarathonTeam(input: {
  joinCode: string;
  csrfToken: string;
  idempotencyKey: string;
}) {
  const payload: JoinMarathonDto = { joinCode: input.joinCode };
  return apiRequest('/marathon-team-memberships', {
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
}) {
  return apiRequest<WellnessReportSavedDto>(
    `/marathon-wellness-reports/${input.reportDate}`,
    {
      method: 'PUT',
      headers: mutationHeaders(input.csrfToken, input.idempotencyKey),
      body: JSON.stringify(input.values),
    },
  );
}

export function completeCaptainTask(input: {
  taskId: string;
  csrfToken: string;
  idempotencyKey: string;
}) {
  const payload: TaskCompletionDto = { completed: true };
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
