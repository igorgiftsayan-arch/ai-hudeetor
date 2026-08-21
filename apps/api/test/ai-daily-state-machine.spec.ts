import {
  applyAiDailyStateTransition,
  type AiDailyStateStatus,
} from '@atlas/backend';

describe('AI daily state machine', () => {
  it.each([
    ['notStarted', 'inProgress'],
    ['inProgress', 'completed'],
  ] as const)('allows %s -> %s', (current, target) => {
    expect(applyAiDailyStateTransition(current, target)).toEqual({
      status: target,
      changed: true,
    });
  });

  it.each(['inProgress', 'completed'] as const)(
    'treats a repeated %s target as an idempotent no-op',
    (status) => {
      expect(applyAiDailyStateTransition(status, status)).toEqual({
        status,
        changed: false,
      });
    },
  );

  it.each([
    ['notStarted', 'completed'],
    ['inProgress', 'notStarted'],
    ['completed', 'inProgress'],
    ['completed', 'notStarted'],
  ] as [AiDailyStateStatus, AiDailyStateStatus][])(
    'rejects %s -> %s',
    (current, target) => {
      expect(() => applyAiDailyStateTransition(current, target)).toThrow(
        expect.objectContaining({ code: 'DAILY_STATE_TRANSITION_INVALID' }),
      );
    },
  );
});
