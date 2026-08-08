import type { ObsSceneMappings } from "./obs-types";

export const DEFAULT_OBS_SCENE_MAPPINGS: ObsSceneMappings = {
  scenes: { host: null, wheel: null, winner: null, break: null, ending: null },
  automation: { spinToWheel: false, revealToWinner: false, acceptToHost: false, finishToEnding: false },
};

export function validateObsSceneMappings(value: unknown, availableScenes?: string[]): ObsSceneMappings {
  if (!value || typeof value !== "object") throw new Error("OBS scene mappings are invalid.");
  const candidate = value as Record<string, unknown>;
  const scenes = candidate.scenes;
  const automation = candidate.automation;
  if (!scenes || typeof scenes !== "object" || !automation || typeof automation !== "object") throw new Error("OBS scene mappings are invalid.");
  const sceneValues = scenes as Record<string, unknown>;
  const toggleValues = automation as Record<string, unknown>;
  const scene = (key: string): string | null => {
    const selected = sceneValues[key];
    if (selected === null || selected === "") return null;
    if (typeof selected !== "string" || selected.length > 512) throw new Error("Select a valid OBS scene.");
    if (availableScenes && !availableScenes.includes(selected)) throw new Error(`Mapped scene no longer exists in OBS: ${selected}`);
    return selected;
  };
  const toggle = (key: string): boolean => {
    const enabled = toggleValues[key];
    if (typeof enabled !== "boolean") throw new Error("OBS automation settings are invalid.");
    return enabled;
  };
  return {
    scenes: { host: scene("host"), wheel: scene("wheel"), winner: scene("winner"), break: scene("break"), ending: scene("ending") },
    automation: { spinToWheel: toggle("spinToWheel"), revealToWinner: toggle("revealToWinner"), acceptToHost: toggle("acceptToHost"), finishToEnding: toggle("finishToEnding") },
  };
}
