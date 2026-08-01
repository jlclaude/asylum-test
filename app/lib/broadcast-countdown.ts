export const BROADCAST_COUNTDOWN_SECONDS = 3;

export function shouldAnimateBroadcastCountdown(reducedMotion: boolean) {
  return !reducedMotion;
}

export function broadcastCountdownLabels(seconds = BROADCAST_COUNTDOWN_SECONDS) {
  return Array.from({ length: seconds }, (_, index) => String(seconds - index));
}
