export type DesktopAutomationEvent = "SPIN" | "WINNER" | "SECOND_CHANCE" | "REWARD" | "ACCEPT_RESULT" | "RAFFLE_FINISHED" | "CELEBRATE";
export type WinnerOverlayPayload = { identity: string; raffleCode: string; gameTitle: string; wheelLabel: string; wheelType: "NAME" | "VALUE"; winnerDisplayName: string | null; rewardValue: string | null; secondChanceBefore: string | null; secondChanceAfter: string | null };

declare global {
  interface Window {
    asylumDesktopHost?: {
      updateIntegrationContext(context: { activeGameId: string; activeRaffleCode: string; activeGameTitle: string; hostCsrfToken: string; broadcastUrl: string; publicClaimUrl: string; facebookPost: string }): Promise<unknown>;
      emitAutomationEvent(event: { event: DesktopAutomationEvent; wheelId?: string; winner?: WinnerOverlayPayload }): void;
    };
  }
}

export function updateDesktopActiveGame(context: { activeGameId: string; activeRaffleCode: string; activeGameTitle: string; hostCsrfToken: string; broadcastUrl: string; publicClaimUrl: string; facebookPost: string }) {
  void window.asylumDesktopHost?.updateIntegrationContext(context);
}

export function emitDesktopAutomationEvent(event: DesktopAutomationEvent, wheelId?: string, winner?: WinnerOverlayPayload) {
  window.asylumDesktopHost?.emitAutomationEvent({ event, ...(wheelId ? { wheelId } : {}), ...(winner ? { winner } : {}) });
}
