import { useEffect, useSyncExternalStore } from "react";
import {
  getSpinMusicSnapshot, initializeSpinMusic, previewSpinMusic, resumeSpinMusic,
  selectSpinMusicTrack, setSpinMusicMuted, setSpinMusicVolume, startSpinMusic,
  stopSpinMusic, stopSpinMusicPreview, subscribeSpinMusic,
} from "../lib/wheel-music.client";

const serverSnapshot = getSpinMusicSnapshot();

export function useSpinMusic() {
  const snapshot = useSyncExternalStore(subscribeSpinMusic, getSpinMusicSnapshot, () => serverSnapshot);
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
