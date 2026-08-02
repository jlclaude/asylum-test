import type { GameStatus } from "@prisma/client";

export const GAME_TITLE_MAX_LENGTH = 150;

export function duplicateGameTitle(title: string) {
  const suffix = " Copy";
  return `${title.slice(0, GAME_TITLE_MAX_LENGTH - suffix.length)}${suffix}`;
}

export function archiveBlockReason(status: GameStatus, hasSpinningWheel: boolean) {
  if (hasSpinningWheel) return "A game cannot be archived while a wheel is spinning.";
  if (status === "IN_PROGRESS") return "An in-progress game cannot be archived. Complete the game before archiving it.";
  return null;
}

export function deleteConfirmationMatches(confirmation: string, gameTitle: string) {
  const normalized = confirmation.trim();
  return normalized === "DELETE" || normalized === gameTitle;
}
