import type {
  CurrentMarathonDto,
  JoinMarathonDto,
  OnboardingResourceDto,
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

type MemberMetric = { status: 'unknown' | 'reported'; dailyPercent?: number | null; markedCount?: number | null };

export type MarathonTeamToday = {
  displayDate: string;
  reportDate: string;
  team: { id: string; name: string };
  currentMembership: { id: string; role: 'captain' | 'participant' };
  captainTask: {
    id: string;
    taskDate: string;
    title: string;
    description: string;
    currentUserCompletion: { status: 'unknown' | 'completed' | 'notCompleted'; updatedAt: string | null };
  } | null;
  members: Array<{
    membershipId: string;
    displayName: string | null;
    isCurrentUser: boolean;
    role: 'captain' | 'participant';
    weight: MemberMetric;
    wellness: MemberMetric;
    captainTask: { status: 'notAssigned' | 'unknown' | 'completed' | 'notCompleted' };
  }>;
  podiums: { weight: null; wellness: null; captainTask: null };
};

export type MarathonScreenData = {
  csrfToken: string;
  current: MarathonCurrent;
  report: WellnessReport;
  team: MarathonTeamToday;
  consent: ProviderConsent;
};

export async function loadMarathonScreen(): Promise<MarathonScreenData> {
  const onboarding = await apiRequest<OnboardingResourceDto>('/users/me/onboarding');
  if (onboarding.status !== 'completed') {
    throw new ApiError('onboarding', 'Завершите настройку, чтобы открыть марафон.');
  }
  const current = await apiRequest<MarathonCurrent>('/marathons/current');
  const [report, team, consent] = await Promise.all([
    apiRequest<WellnessReport>(`/marathon-wellness-reports/${current.reportDate}`),
    apiRequest<MarathonTeamToday>('/marathon-teams/current/today'),
    loadProviderConsent(),
  ]);
  return { csrfToken: onboarding.csrfToken, current, report, team, consent };
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
  return apiRequest(`/marathon-captain-tasks/${input.taskId}/completion`, {
    method: 'PUT',
    headers: mutationHeaders(input.csrfToken, input.idempotencyKey),
    body: JSON.stringify({ completed: true }),
  });
}

export function saveCaptainTask(input: {
  taskDate: string;
  title: string;
  description: string;
  csrfToken: string;
  idempotencyKey: string;
}) {
  return apiRequest<{
    id: string;
    teamId: string;
    taskDate: string;
    title: string;
    description: string;
    updatedAt: string;
  }>(`/marathon-captain-tasks/${input.taskDate}`, {
    method: 'PUT',
    headers: mutationHeaders(input.csrfToken, input.idempotencyKey),
    body: JSON.stringify({ title: input.title, description: input.description }),
  });
}
