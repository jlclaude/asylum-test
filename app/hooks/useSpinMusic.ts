import { useEffect, useSyncExternalStore } from "react";
import type { SpinMusicSnapshot } from "../lib/wheel-music";
import {
  finishSpinMusic, getSpinMusicSnapshot, initializeSpinMusic, playIdleMusic,
  previewSpinMusic, resumeSpinMusic, setSpinMusicMuted, setSpinMusicVolume, startSpinMusic,
  stopSpinMusic, stopSpinMusicPreview, subscribeToSpinMusic,
  stopAllWheelMusic,
} from "../lib/wheel-music";

const SERVER_SNAPSHOT: SpinMusicSnapshot = {
  idleTracks: [],
  spinTracks: [],
  activeTrackId: "",
  activePlaylist: null,
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
    setVolume: setSpinMusicVolume,
    setMuted: setSpinMusicMuted,
    preview: previewSpinMusic,
    resume: resumeSpinMusic,
    stop: stopSpinMusic,
    stopPreview: stopSpinMusicPreview,
    stopAll: stopAllWheelMusic,
    startSpin: startSpinMusic,
    finishSpin: finishSpinMusic,
    playIdle: playIdleMusic,
  };
}
