import { useEffect, useRef, useState, type ReactNode } from "react";
import { AsylumLogo } from "../asylum/AsylumLogo";

export type BroadcastPresentationInfo = {
  gameTitle: string;
  raffleCode: string;
  gameStatus: string;
  wheelLabel: string | null;
  wheelSequence: string | null;
  wheelStatus: string;
  entryCount: number;
  winner: string | null;
  secondChance: Array<{ label: string; value: string }>;
  upNext: string | null;
  reward: string | null;
  bonus: string | null;
  spinning: boolean;
};

type HealthBridge = {
  reportHealth(value: {
    state: string;
    gameState: string | null;
    raffleCode: string | null;
    wheelLabel: string | null;
    status: "live";
    message: null;
  }): void;
};

type BroadcastScaleMode = "fit" | 1 | 1.25 | 1.5;

export function BroadcastPresentation({
  info,
  healthState,
  wheel,
  operatorTools,
  resultAction,
  overlay,
  viewportMode = "operator",
}: {
  info: BroadcastPresentationInfo;
  healthState: string;
  wheel: ReactNode;
  operatorTools?: ReactNode;
  resultAction?: ReactNode;
  overlay?: ReactNode;
  viewportMode?: "operator" | "output";
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [scaleMode, setScaleMode] = useState<BroadcastScaleMode>("fit");
  useEffect(() => {
    (
      window as typeof window & { asylumBroadcastDesktop?: HealthBridge }
    ).asylumBroadcastDesktop?.reportHealth({
      state: healthState,
      gameState: info.gameStatus,
      raffleCode: info.raffleCode,
      wheelLabel: info.wheelLabel,
      status: "live",
      message: null,
    });
  }, [healthState, info.gameStatus, info.raffleCode, info.wheelLabel]);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resize = () =>
      setFitScale(
        Math.min(viewport.clientWidth / 1920, viewport.clientHeight / 1080),
      );
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    resize();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const update = (event: Event) => {
      const value = (event as CustomEvent<BroadcastScaleMode>).detail;
      if (value === "fit" || value === 1 || value === 1.25 || value === 1.5)
        setScaleMode(value);
    };
    window.addEventListener("asylum-broadcast-scale", update);
    return () => window.removeEventListener("asylum-broadcast-scale", update);
  }, []);
  const scale =
    viewportMode === "output" || scaleMode === "fit" ? fitScale : scaleMode;
  return (
    <div
      ref={viewportRef}
      className={`broadcast-viewport broadcast-viewport-${viewportMode}${scaleMode === "fit" ? " is-fit" : " is-manual"}`}
    >
      <div
        className="broadcast-canvas-frame"
        style={{ width: `${1920 * scale}px`, height: `${1080 * scale}px` }}
      >
        <section
          className={`broadcast-presentation${info.spinning ? " is-spinning" : ""}`}
          style={{ transform: `scale(${scale})` }}
        >
          <header className="broadcast-presentation-header">
            <AsylumLogo className="broadcast-presentation-logo" />
            <div className="broadcast-presentation-title">
              <p>ASYLUM GAMES LIVE</p>
              <h1>{info.gameTitle}</h1>
            </div>
            <div className="broadcast-presentation-id">
              <span>RAFFLE</span>
              <strong>{info.raffleCode}</strong>
              <small>
                {info.wheelLabel ?? "Awaiting production"}
                {info.wheelSequence ? ` · WHEEL ${info.wheelSequence}` : ""}
              </small>
            </div>
          </header>
          {operatorTools ? (
            <div className="broadcast-operator-tools">{operatorTools}</div>
          ) : null}
          <main className="broadcast-presentation-stage">
            <div className="broadcast-presentation-wheel">{wheel}</div>
            <div className="broadcast-state-bug">
              {info.wheelStatus.replace("_", " ")}
            </div>
          </main>
          <section className="broadcast-presentation-lower">
            <article className="broadcast-winner-area">
              <span>
                {healthState === "REWARD_CHAMBER"
                  ? "REWARD CHAMBER"
                  : "CURRENT WINNER"}
              </span>
              <strong>
                {healthState === "REWARD_CHAMBER"
                  ? (info.reward ?? "READY")
                  : (info.winner ??
                    (info.spinning ? "CONTAINMENT IN PROGRESS" : "READY"))}
              </strong>
              {resultAction ? (
                <div className="broadcast-result-action">{resultAction}</div>
              ) : null}
            </article>
            <article className="broadcast-second-area">
              <span>SECOND CHANCE</span>
              <strong>
                {info.secondChance.length
                  ? info.secondChance.map((item) => item.value).join(" · ")
                  : "PENDING"}
              </strong>
            </article>
          </section>
          {overlay}
          <footer className="broadcast-presentation-footer">
            <span>ASYLUMGAMES.COM</span>
            <span>FACEBOOK · ASYLUM GAMES</span>
            <span>
              UPCOMING PRIZE · {info.upNext ?? info.bonus ?? "TO BE ANNOUNCED"}
            </span>
          </footer>
        </section>
      </div>
    </div>
  );
}
