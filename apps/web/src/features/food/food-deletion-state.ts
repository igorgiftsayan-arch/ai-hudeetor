import type { FoodDeletionStatus } from './food-api';

// Deletion and cancellation cannot be undone by an older read response.
export function mergeFoodDeletionStatus(
  previous: FoodDeletionStatus | undefined,
  incoming: FoodDeletionStatus,
): FoodDeletionStatus {
  if (!previous) return incoming;
  const photoRank = { available: 0, pending: 1, deleted: 2 };
  return {
    analysisId: incoming.analysisId,
    photoStatus:
      photoRank[previous.photoStatus] > photoRank[incoming.photoStatus]
        ? previous.photoStatus
        : incoming.photoStatus,
    analysisStatus:
      previous.analysisStatus === 'deleted'
        ? 'deleted'
        : incoming.analysisStatus,
    cancellationStatus:
      previous.cancellationStatus === 'cancelledRefunded'
        ? 'cancelledRefunded'
        : incoming.cancellationStatus,
  };
}
