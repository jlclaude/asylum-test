import type { WheelOperatorAction } from "../components/wheel/types";

type WheelTarget = { id: string; status: "READY" | "SPINNING" | "COMPLETED" };

export function unfinishedWheelIds(wheels: WheelTarget[], completedLocally: ReadonlySet<string> = new Set()) {
  return wheels.filter((wheel) => wheel.status !== "COMPLETED" && !completedLocally.has(wheel.id)).map((wheel) => wheel.id);
}

export function defaultActiveWheelId(wheels: WheelTarget[]) {
  return wheels.find((wheel) => wheel.status !== "COMPLETED")?.id ?? wheels[0]?.id ?? null;
}

export function defaultGameModeActiveWheelId(wheels: WheelTarget[]) {
  const completed = wheels.filter((wheel) => wheel.status === "COMPLETED");
  return completed.at(-1)?.id ?? defaultActiveWheelId(wheels);
}

export function defaultBroadcastActiveWheelId(wheels: WheelTarget[]) {
  const completed = wheels.filter((wheel) => wheel.status === "COMPLETED");
  return completed.at(-1)?.id ?? defaultActiveWheelId(wheels);
}

export function nextUnfinishedWheelId(wheels: WheelTarget[], completedId: string) {
  const currentIndex = wheels.findIndex((wheel) => wheel.id === completedId);
  const ordered = currentIndex < 0
    ? wheels
    : [...wheels.slice(currentIndex + 1), ...wheels.slice(0, currentIndex)];
  return ordered.find((wheel) => wheel.id !== completedId && wheel.status !== "COMPLETED")?.id ?? null;
}

export function broadcastWheelStatus(wheel: { status: WheelTarget["status"]; spinDurationSeconds: number | null }) {
  return wheel.status === "READY" && wheel.spinDurationSeconds ? "TIME SELECTED" : wheel.status;
}

export function adjacentWheelId(ids: string[], activeId: string | null, direction: 1 | -1) {
  if (ids.length === 0) return null;
  const currentIndex = ids.indexOf(activeId ?? "");
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + ids.length) % ids.length;
  return ids[nextIndex];
}

export function wheelActionBlockReason(
  action: WheelOperatorAction,
  state: { status: WheelTarget["status"]; spinning: boolean; busy: boolean; selectedDuration: number | null },
) {
  if (state.status === "COMPLETED") return "This wheel is already completed.";
  if (state.spinning || state.status === "SPINNING") return "Wheel is currently spinning.";
  if (state.busy) return "Wheel controls are currently busy.";
  if (state.status !== "READY") return "This wheel is not ready.";
  if (action === "spin-wheel" && !state.selectedDuration) return "Select a random time first.";
  return null;
}

export function shortcutTargetIsEditable(target: { tagName?: string; isContentEditable?: boolean } | null) {
  if (!target) return false;
  return Boolean(target.isContentEditable) || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName ?? "");
}

export function wheelScrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}

export function savedSoundIsMuted(value: string | null) {
  return value === "true";
}

export function fullscreenIsActive(standardElement: Element | null, webkitElement?: Element | null) {
  return Boolean(standardElement ?? webkitElement);
}
