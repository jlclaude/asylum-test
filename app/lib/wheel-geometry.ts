export const WHEEL_SEGMENT_START_ANGLE_DEGREES = -90;
export const WHEEL_POINTER_ANGLE_DEGREES = 0;

export function normalizeDegrees(value: number) {
  if (!Number.isFinite(value)) return 0;
  return ((value % 360) + 360) % 360;
}

type WinningRestRotationOptions = {
  entryCount: number;
  winnerEntryIndex: number;
  pointerAngleDegrees?: number;
};

export function getWinningRestRotation({
  entryCount,
  winnerEntryIndex,
  pointerAngleDegrees = WHEEL_POINTER_ANGLE_DEGREES,
}: WinningRestRotationOptions) {
  if (
    !Number.isInteger(entryCount) ||
    entryCount <= 0 ||
    !Number.isInteger(winnerEntryIndex) ||
    winnerEntryIndex < 0 ||
    winnerEntryIndex >= entryCount ||
    !Number.isFinite(pointerAngleDegrees)
  ) {
    return 0;
  }

  const segmentDegrees = 360 / entryCount;
  const winnerCenterDegrees = (winnerEntryIndex + 0.5) * segmentDegrees;

  return normalizeDegrees(
    pointerAngleDegrees -
      (WHEEL_SEGMENT_START_ANGLE_DEGREES + winnerCenterDegrees),
  );
}
