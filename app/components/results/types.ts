export type WheelResultStatus = "READY" | "SPINNING" | "COMPLETED";

export type WheelResult = {
  id?: string;
  label: string;
  type: "NAME" | "VALUE";
  status: WheelResultStatus;
  winner: string | null;
  spinDurationSeconds: number | null;
  completedAt: string | null;
  winningClaimQuantity: number | null;
  resultAcceptedAt?: string | null;
};

export type RoundResults = {
  title: string;
  status: "READY" | "IN_PROGRESS" | "COMPLETED";
  wheels: WheelResult[];
};

export type GameResults = {
  completedAt: string | null;
  rounds: RoundResults[];
};
