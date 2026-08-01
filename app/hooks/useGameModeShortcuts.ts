import { useEffect } from "react";
import type { WheelOperatorResult } from "../components/wheel/types";
import { shortcutTargetIsEditable } from "../lib/game-mode-operator";

export function isShortcutTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return shortcutTargetIsEditable(target);
}

type ShortcutHandlers = {
  shuffle: () => WheelOperatorResult;
  selectDuration: () => WheelOperatorResult;
  spin: () => WheelOperatorResult;
  nextWheel: () => WheelOperatorResult;
  previousWheel: () => WheelOperatorResult;
  releaseFocus: () => WheelOperatorResult;
  toggleFullscreen: () => WheelOperatorResult;
  toggleSound: () => WheelOperatorResult;
  showMessage: (message: string) => void;
};

export function useGameModeShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isShortcutTypingTarget(event.target)) return;

      let result: WheelOperatorResult | null = null;
      const key = event.key.toLowerCase();

      if (key === "s") result = handlers.shuffle();
      else if (key === "t") result = handlers.selectDuration();
      else if (event.code === "Space") result = handlers.spin();
      else if (event.key === "ArrowDown") result = handlers.nextWheel();
      else if (event.key === "ArrowUp") result = handlers.previousWheel();
      else if (event.key === "Escape") result = handlers.releaseFocus();
      else if (key === "f") result = handlers.toggleFullscreen();
      else if (key === "m") result = handlers.toggleSound();

      if (!result) return;
      if (result.triggered && event.key !== "Escape") event.preventDefault();
      if (result.message) handlers.showMessage(result.message);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
