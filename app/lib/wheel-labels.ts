export const REWARD_CHAMBER_LABEL = "Reward Chamber";

export function getContainmentLabel(position: number) {
  if (!Number.isInteger(position) || position < 1) {
    throw new Error("Containment position must be a positive integer.");
  }
  let current = position;
  let suffix = "";
  while (current > 0) {
    current -= 1;
    suffix = String.fromCharCode(65 + (current % 26)) + suffix;
    current = Math.floor(current / 26);
  }
  return `Containment ${suffix}`;
}

export function getWheelDisplayLabel(type: "NAME" | "VALUE", position: number) {
  return type === "VALUE" ? REWARD_CHAMBER_LABEL : getContainmentLabel(position);
}
