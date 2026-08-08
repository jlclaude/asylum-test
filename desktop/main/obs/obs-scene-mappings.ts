import type { ObsSceneMappings } from "./obs-types";

export const DEFAULT_OBS_SCENE_MAPPINGS: ObsSceneMappings = {
  scenes: { host: null, wheel: null, winner: null, secondChance: null, reward: null, break: null, ending: null },
  automation: { spinToWheel: false, revealToWinner: false, secondChance: false, reward: false, acceptToHost: false, finishToEnding: false },
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
    scenes: { host: scene("host"), wheel: scene("wheel"), winner: scene("winner"), secondChance: scene("secondChance"), reward: scene("reward"), break: scene("break"), ending: scene("ending") },
    automation: { spinToWheel: toggle("spinToWheel"), revealToWinner: toggle("revealToWinner"), secondChance: toggle("secondChance"), reward: toggle("reward"), acceptToHost: toggle("acceptToHost"), finishToEnding: toggle("finishToEnding") },
  };
}

export type StudioProfile = {
  hostScene: string; wheelScene: string; winnerScene: string; secondChanceScene: string; rewardScene: string; breakScene: string; endingScene: string;
  automation: { wheel: boolean; winner: boolean; secondChance: boolean; reward: boolean; host: boolean; ending: boolean };
};

export function exportStudioProfile(value: ObsSceneMappings): StudioProfile {
  return { hostScene: value.scenes.host ?? "", wheelScene: value.scenes.wheel ?? "", winnerScene: value.scenes.winner ?? "", secondChanceScene: value.scenes.secondChance ?? "", rewardScene: value.scenes.reward ?? "", breakScene: value.scenes.break ?? "", endingScene: value.scenes.ending ?? "", automation: { wheel: value.automation.spinToWheel, winner: value.automation.revealToWinner, secondChance: value.automation.secondChance, reward: value.automation.reward, host: value.automation.acceptToHost, ending: value.automation.finishToEnding } };
}

export function importStudioProfile(value: unknown): ObsSceneMappings {
  if (!value || typeof value !== "object") throw new Error("Studio profile is invalid.");
  const profile = value as Record<string, unknown>; const automation = profile.automation;
  if (!automation || typeof automation !== "object") throw new Error("Studio profile is invalid.");
  const toggles = automation as Record<string, unknown>;
  return validateObsSceneMappings({ scenes: { host: profile.hostScene, wheel: profile.wheelScene, winner: profile.winnerScene, secondChance: profile.secondChanceScene, reward: profile.rewardScene, break: profile.breakScene, ending: profile.endingScene }, automation: { spinToWheel: toggles.wheel, revealToWinner: toggles.winner, secondChance: toggles.secondChance, reward: toggles.reward, acceptToHost: toggles.host, finishToEnding: toggles.ending } });
}
