import { useEffect, useState } from "react";
import { fullscreenIsActive } from "../lib/game-mode-operator";

type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function useFullscreen(target: React.RefObject<HTMLElement>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const update = () => {
      const documentWithWebkit = document as WebkitDocument;
      setIsFullscreen(fullscreenIsActive(document.fullscreenElement, documentWithWebkit.webkitFullscreenElement));
    };

    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    update();

    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, []);

  async function toggleFullscreen() {
    try {
      const documentWithWebkit = document as WebkitDocument;
      const fullscreenElement = document.fullscreenElement ?? documentWithWebkit.webkitFullscreenElement;

      if (fullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (documentWithWebkit.webkitExitFullscreen) await documentWithWebkit.webkitExitFullscreen();
        else return false;
        return true;
      }

      const element = (target.current ?? document.documentElement) as WebkitElement;
      if (element.requestFullscreen) await element.requestFullscreen();
      else if (element.webkitRequestFullscreen) await element.webkitRequestFullscreen();
      else return false;
      return true;
    } catch {
      return false;
    }
  }

  return { isFullscreen, toggleFullscreen };
}
