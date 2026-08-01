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
};
