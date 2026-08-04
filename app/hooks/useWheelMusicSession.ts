import { useEffect } from "react";
import { beginWheelMusicSession, endWheelMusicSession, stopAllWheelMusic } from "../lib/wheel-music";

export function useWheelMusicSession(sessionKey: string) {
  useEffect(() => {
    const session = beginWheelMusicSession();
    const stopForPageExit = () => stopAllWheelMusic();
    window.addEventListener("pagehide", stopForPageExit);
    return () => {
      window.removeEventListener("pagehide", stopForPageExit);
      endWheelMusicSession(session);
    };
  }, [sessionKey]);
}
