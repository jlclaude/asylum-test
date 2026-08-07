export type WheelEntry =
  | {
      claimId: string;
      displayName: string;
    }
  | {
      value: string;
    };

export type WheelData = {
  id: string;
  type: "NAME" | "VALUE";
  label: string;
  status: "READY" | "SPINNING" | "COMPLETED";
  entries: WheelEntry[];
  spinDurationSeconds: number | null;
  winnerEntryIndex: number | null;
  winnerDisplayName: string | null;
  winnerValue: string | null;
  spunAt: string | null;
  resultAcceptedAt: string | null;
};

export type WheelActionData = {
  error?: string;
  success?: string;
  intent?: string;
  wheelId?: string;
  winnerEntryIndex?: number;
  winnerDisplayName?: string;
  winnerValue?: string;
  spinDurationSeconds?: number;
  spinToken?: string;
  secondChance?: {
    calculatedAt: string;
    beforeDisplayName: string | null;
    afterDisplayName: string | null;
  } | null;
  privateUrl?: string;
  stale?: boolean;
  authoritativeWheel?: Partial<WheelData> & Pick<WheelData, "id" | "status">;
};

export type WheelOperatorAction =
  | "shuffle-wheel"
  | "select-duration"
  | "spin-wheel";

export type WheelOperatorState = {
  id: string;
  label: string;
  status: WheelData["status"];
  selectedDuration: number | null;
  spinning: boolean;
};

export type WheelOperatorResult = {
  triggered: boolean;
  message?: string;
};

export type WheelOperatorHandle = {
  runAction: (action: WheelOperatorAction) => WheelOperatorResult;
  scrollIntoView: (reducedMotion: boolean) => void;
};
