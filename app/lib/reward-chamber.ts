export const REWARD_CHAMBER_VALUES = [
  "12.5", "12.5", "12.5", "12.5", "12.5", "12.5",
  "25", "25", "25", "25", "25", "25",
  "37.5", "37.5", "50", "75", "100", "125", "250",
] as const;

export const rewardChamberEntries = () =>
  REWARD_CHAMBER_VALUES.map((value) => ({ value }));
