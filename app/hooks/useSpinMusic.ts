import { useEffect, useSyncExternalStore } from "react";
import type { SpinMusicSnapshot } from "../lib/wheel-music";
import {
  getSpinMusicSnapshot, initializeSpinMusic, previewSpinMusic, resumeSpinMusic,
  selectSpinMusicTrack, setSpinMusicMuted, setSpinMusicVolume, startSpinMusic,
  stopSpinMusic, stopSpinMusicPreview, subscribeToSpinMusic,
} from "../lib/wheel-music";

const SERVER_SNAPSHOT: SpinMusicSnapshot = {
  tracks: [],
  trackId: "",
  volume: 0.7,
  muted: false,
  status: "OFF",
  warning: null,
};

export function useSpinMusic() {
  const snapshot = useSyncExternalStore(
    subscribeToSpinMusic,
    getSpinMusicSnapshot,
    () => SERVER_SNAPSHOT,
  );
  useEffect(() => initializeSpinMusic(), []);
  return {
    ...snapshot,
    selectTrack: selectSpinMusicTrack,
    setVolume: setSpinMusicVolume,
    setMuted: setSpinMusicMuted,
    preview: previewSpinMusic,
    resume: resumeSpinMusic,
    stop: stopSpinMusic,
    stopPreview: stopSpinMusicPreview,
    startSpin: startSpinMusic,
  };
}
