import { useEffect, useState } from "react";
import { setWheelAudioMuted } from "../lib/wheel-effects.client";
import { savedSoundIsMuted } from "../lib/game-mode-operator";

const STORAGE_KEY = "asylum-games:wheel-sound-muted";

export function useSoundPreference() {
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    try {
      const savedMuted = savedSoundIsMuted(window.localStorage.getItem(STORAGE_KEY));
      setMutedState(savedMuted);
      setWheelAudioMuted(savedMuted);
    } catch {
      setWheelAudioMuted(false);
    }
  }, []);

  function setMuted(nextMuted: boolean) {
    setMutedState(nextMuted);
    setWheelAudioMuted(nextMuted);

    try {
      window.localStorage.setItem(STORAGE_KEY, String(nextMuted));
    } catch {
      // Storage failures must not affect wheel operation.
    }
  }

  return { muted, setMuted, toggleMuted: () => setMuted(!muted) };
}
