export type DesktopAutomationEvent = "SPIN" | "WINNER" | "SECOND_CHANCE" | "REWARD" | "ACCEPT_RESULT" | "RAFFLE_FINISHED";

declare global {
  interface Window {
    asylumDesktopHost?: {
      updateIntegrationContext(context: { gameId: string; publicClaimUrl: string; facebookPost: string }): Promise<unknown>;
      emitAutomationEvent(event: { event: DesktopAutomationEvent; wheelId?: string }): void;
    };
  }
}

export function emitDesktopAutomationEvent(event: DesktopAutomationEvent, wheelId?: string) {
  window.asylumDesktopHost?.emitAutomationEvent({ event, ...(wheelId ? { wheelId } : {}) });
}
