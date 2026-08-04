import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFetcher } from "react-router";

import {
  animateWheelIdle,
  animateWheelSpin,
  createConfettiBurst,
  playContainmentLock,
  playWinnerTone,
  remainingSpinSeconds,
  type WheelAnimationController,
} from "../../lib/wheel-effects.client";
import {
  ASYLUM_THEMES,
  type AsylumThemeKey,
} from "../../lib/asylum-themes";
import { wheelActionBlockReason, wheelScrollBehavior } from "../../lib/game-mode-operator";
import { shouldAnimateBroadcastCountdown } from "../../lib/broadcast-countdown";
import { SPIN_DURATION_RANGE_LABEL } from "../../lib/spin-duration";
import { getWinningRestRotation } from "../../lib/wheel-geometry";
import { useSpinMusic } from "../../hooks/useSpinMusic";
import { WheelCanvas } from "./WheelCanvas";
import { WheelConsole } from "./WheelConsole";
import { ContainmentReveal } from "./ContainmentReveal";
import { SecondChanceResult } from "../second-chance/SecondChanceResult";
import type {
  WheelActionData,
  WheelData,
  WheelOperatorAction,
  WheelOperatorHandle,
  WheelOperatorState,
} from "./types";

type WheelSectionProps = {
  wheel: WheelData;
  themeKey: AsylumThemeKey;
  sequenceNumber: number;
  isActive: boolean;
  isOperatorLocked: boolean;
  onSelect: (wheelId: string) => void;
  onCompleted: (wheelId: string) => void;
  onOperatorStateChange: (state: WheelOperatorState) => void;
  broadcastCountdown?: boolean;
  allowLockedSelection?: boolean;
  systemMessage?: string | null;
  secondChanceResult?: {
    offset: number;
    beforeDisplayName: string | null;
    afterDisplayName: string | null;
  } | null;
  resultAccepted?: boolean;
  onAcceptResult?: (wheelId: string) => void;
};

function entryLabel(
  entry: WheelData["entries"][number],
) {
  return "displayName" in entry
    ? entry.displayName
    : entry.value;
}

export const WheelSection = forwardRef<WheelOperatorHandle, WheelSectionProps>(function WheelSection({
  wheel,
  themeKey,
  sequenceNumber,
  isActive,
  isOperatorLocked,
  onSelect,
  onCompleted,
  onOperatorStateChange,
  broadcastCountdown = false,
  allowLockedSelection = false,
  systemMessage = null,
  secondChanceResult = null,
  resultAccepted = false,
  onAcceptResult,
}, operatorRef) {
  const sectionRef = useRef<HTMLElement>(null);
  const fetcher = useFetcher<WheelActionData>();
  const { startSpin: startMusic, finishSpin: finishMusic, stop: stopMusic } = useSpinMusic();
  const lastSpinToken = useRef<string | null>(null);
  const completionSent = useRef(false);
  const animationController =
    useRef<WheelAnimationController | null>(null);
  const idleController = useRef<WheelAnimationController | null>(null);
  const revealActive = useRef(false);
  const revealDismissTimer = useRef<number | null>(null);
  const celebrationCleanup = useRef<(() => void) | null>(null);
  const countdownTimers = useRef<number[]>([]);
  const submittedControl = useRef<HTMLButtonElement | null>(null);

  const completedRestRotation = wheel.status === "COMPLETED" &&
    wheel.winnerEntryIndex !== null
    ? getWinningRestRotation({
        entryCount: wheel.entries.length,
        winnerEntryIndex: wheel.winnerEntryIndex,
      })
    : 0;
  const [rotation, setRotation] = useState(completedRestRotation);
  const rotationRef = useRef(rotation);
  const [pointerTick, setPointerTick] = useState(0);
  const [pointerIntensity, setPointerIntensity] = useState(0.3);
  const [revealResult, setRevealResult] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [countdownLabel, setCountdownLabel] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(
    wheel.status === "SPINNING",
  );
  const [idleMotionAllowed, setIdleMotionAllowed] = useState(false);

  const [result, setResult] = useState<string | null>(
    wheel.status === "COMPLETED"
      ? wheel.winnerDisplayName ?? wheel.winnerValue
      : null,
  );

  useEffect(() => {
    const timers = countdownTimers;
    return () => {
      animationController.current?.cancel();
      idleController.current?.cancel();
      stopMusic(wheel.id);

      if (revealDismissTimer.current !== null) {
        window.clearTimeout(revealDismissTimer.current);
      }
      celebrationCleanup.current?.();
      timers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, [stopMusic, wheel.id]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setIdleMotionAllowed(!media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  const selectedDuration =
    fetcher.data?.wheelId === wheel.id &&
    fetcher.data.spinDurationSeconds
      ? fetcher.data.spinDurationSeconds
      : wheel.spinDurationSeconds;

  const busy = fetcher.state !== "idle" || spinning || countdownLabel !== null;
  const ready = wheel.status === "READY" && !spinning;

  const stopIdle = useCallback(() => {
    idleController.current?.cancel();
    idleController.current = null;
  }, []);

  const submitReadyAction = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    stopIdle();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    submittedControl.current = submitter instanceof HTMLButtonElement ? submitter : null;
  }, [stopIdle]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !submittedControl.current) return;
    const control = submittedControl.current;
    submittedControl.current = null;
    if (document.activeElement === document.body && !control.disabled) {
      control.focus({ preventScroll: true });
    }
  }, [fetcher.state]);

  useEffect(() => {
    stopIdle();
    if (
      !idleMotionAllowed ||
      wheel.status !== "READY" ||
      spinning ||
      fetcher.state !== "idle" ||
      countdownLabel !== null
    ) {
      return;
    }

    idleController.current = animateWheelIdle({
      startRotation: rotationRef.current,
      onFrame: (nextRotation) => {
        rotationRef.current = nextRotation;
        setRotation(nextRotation);
      },
    });

    return stopIdle;
  }, [countdownLabel, fetcher.state, idleMotionAllowed, spinning, stopIdle, wheel.status]);

  const submitSpin = useCallback(() => {
    const blocked = wheelActionBlockReason("spin-wheel", {
      status: wheel.status,
      spinning,
      busy: fetcher.state !== "idle" || countdownLabel !== null,
      selectedDuration,
    });
    if (blocked) return { triggered: false, message: blocked };
    stopIdle();

    const submit = () => fetcher.submit(
      { intent: "spin-wheel", wheelId: wheel.id },
      { method: "post" },
    );

    if (!broadcastCountdown) {
      submit();
      return { triggered: true, message: `${wheel.label}: command submitted.` };
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!shouldAnimateBroadcastCountdown(reducedMotion)) {
      setCountdownLabel("CONTAINMENT ENGAGED");
      submit();
      countdownTimers.current.push(window.setTimeout(() => setCountdownLabel(null), 700));
      return { triggered: true, message: `${wheel.label}: containment engaged.` };
    }

    setCountdownLabel("3");
    countdownTimers.current.push(
      window.setTimeout(() => setCountdownLabel("2"), 1000),
      window.setTimeout(() => setCountdownLabel("1"), 2000),
      window.setTimeout(() => {
        setCountdownLabel("CONTAINMENT ENGAGED");
        submit();
      }, 3000),
      window.setTimeout(() => setCountdownLabel(null), 3800),
    );
    return { triggered: true, message: `${wheel.label}: countdown started.` };
  }, [broadcastCountdown, countdownLabel, fetcher, selectedDuration, spinning, stopIdle, wheel.id, wheel.label, wheel.status]);

  useImperativeHandle(operatorRef, () => ({
    runAction: (action: WheelOperatorAction) => {
      if (action === "spin-wheel") return submitSpin();
      const blocked = wheelActionBlockReason(action, { status: wheel.status, spinning, busy: fetcher.state !== "idle", selectedDuration });
      if (blocked) return { triggered: false, message: blocked };

      stopIdle();
      fetcher.submit({ intent: action, wheelId: wheel.id }, { method: "post" });
      return { triggered: true, message: `${wheel.label}: command submitted.` };
    },
    scrollIntoView: (reducedMotion: boolean) => {
      sectionRef.current?.scrollIntoView({
        behavior: wheelScrollBehavior(reducedMotion),
        block: "start",
      });
    },
  }), [fetcher, selectedDuration, spinning, stopIdle, submitSpin, wheel.id, wheel.label, wheel.status]);

  useEffect(() => {
    onOperatorStateChange({
      id: wheel.id,
      label: wheel.label,
      status: spinning ? "SPINNING" : wheel.status,
      selectedDuration,
      spinning,
    });
  }, [onOperatorStateChange, selectedDuration, spinning, wheel.id, wheel.label, wheel.status]);

  const uniqueCount = useMemo(() => {
    if (wheel.type === "VALUE") {
      return new Set(
        wheel.entries.map(entryLabel),
      ).size;
    }

    return new Set(
      wheel.entries
        .filter(
          (
            entry,
          ): entry is {
            claimId: string;
            displayName: string;
          } => "claimId" in entry,
        )
        .map((entry) => entry.claimId),
    ).size;
  }, [wheel.entries, wheel.type]);

  useEffect(() => {
    if (wheel.status === "COMPLETED" && !revealActive.current) {
      const restRotation = getWinningRestRotation({
        entryCount: wheel.entries.length,
        winnerEntryIndex: wheel.winnerEntryIndex ?? -1,
      });
      animationController.current?.cancel();
      stopIdle();
      rotationRef.current = restRotation;
      setRotation(restRotation);
      stopMusic(wheel.id);
      setResult(
        wheel.winnerDisplayName ??
          wheel.winnerValue,
      );
      setSpinning(false);
    }
  }, [
    stopMusic,
    stopIdle,
    wheel.entries.length,
    wheel.id,
    wheel.status,
    wheel.winnerDisplayName,
    wheel.winnerEntryIndex,
    wheel.winnerValue,
  ]);

  useEffect(() => {
    if (
      wheel.status !== "SPINNING" ||
      !wheel.spunAt ||
      wheel.winnerEntryIndex === null ||
      !wheel.spinDurationSeconds ||
      lastSpinToken.current === wheel.spunAt
    ) {
      return;
    }

    lastSpinToken.current = wheel.spunAt;
    completionSent.current = false;

    const finalResult =
      wheel.winnerDisplayName ??
      wheel.winnerValue ??
      "Result";

    const remainingSeconds = remainingSpinSeconds(
      wheel.spunAt,
      wheel.spinDurationSeconds,
    );

    if (
      remainingSeconds === null ||
      wheel.entries.length === 0 ||
      wheel.winnerEntryIndex < 0 ||
      wheel.winnerEntryIndex >= wheel.entries.length
    ) {
      setSpinning(false);
      setRecoveryError(
        "This saved spin contains invalid recovery data. Reload Game Mode or return to the Control Center.",
      );
      return;
    }

    const completeRecoveredSpin = () => {
      finishMusic(wheel.id);
      setSpinning(false);
      setPointerIntensity(1);
      setPointerTick((tick) => tick + 1);
      revealActive.current = true;
      setRevealResult(finalResult);
      playContainmentLock();

      if (!completionSent.current) {
        completionSent.current = true;
        fetcher.submit(
          {
            intent: "complete-wheel",
            wheelId: wheel.id,
          },
          { method: "post" },
        );
      }

      onCompleted(wheel.id);
    };

    setResult(null);
    setRecoveryError(null);
    setRevealResult(null);
    setCelebrating(false);
    revealActive.current = false;
    setSpinning(true);
    stopIdle();
    animationController.current?.cancel();

    if (remainingSeconds === 0) {
      completeRecoveredSpin();
      return;
    }

    void startMusic(
      wheel.id,
      wheel.spinDurationSeconds - remainingSeconds,
    );

    animationController.current = animateWheelSpin({
      startRotation: rotationRef.current,
      entryCount: wheel.entries.length,
      winnerEntryIndex: wheel.winnerEntryIndex,
      durationSeconds: wheel.spinDurationSeconds,
      elapsedSeconds: wheel.spinDurationSeconds - remainingSeconds,
      onFrame: (nextRotation) => {
        rotationRef.current = nextRotation;
        setRotation(nextRotation);
      },
      onTick: (intensity) => {
        setPointerIntensity(intensity);
        setPointerTick((tick) => tick + 1);
      },
      onComplete: completeRecoveredSpin,
    });
  }, [
    fetcher,
    finishMusic,
    onCompleted,
    startMusic,
    stopIdle,
    stopMusic,
    wheel.entries.length,
    wheel.id,
    wheel.spinDurationSeconds,
    wheel.spunAt,
    wheel.status,
    wheel.winnerDisplayName,
    wheel.winnerEntryIndex,
    wheel.winnerValue,
  ]);

  useEffect(() => {
    const data = fetcher.data;

    if (
      data?.intent !== "spin-wheel" ||
      data.wheelId !== wheel.id ||
      !data.spinToken ||
      data.spinToken === lastSpinToken.current ||
      data.winnerEntryIndex === undefined ||
      !data.spinDurationSeconds
    ) {
      return;
    }

    lastSpinToken.current = data.spinToken;
    completionSent.current = false;

    const finalResult =
      data.winnerDisplayName ??
      data.winnerValue ??
      "Result";

    setResult(null);
    setRevealResult(null);
    setCelebrating(false);
    revealActive.current = false;
    setSpinning(true);

    stopIdle();
    animationController.current?.cancel();
    void startMusic(wheel.id, 0);

    animationController.current = animateWheelSpin({
      startRotation: rotationRef.current,
      entryCount: wheel.entries.length,
      winnerEntryIndex: data.winnerEntryIndex,
      durationSeconds: data.spinDurationSeconds,
      onFrame: (nextRotation) => {
        rotationRef.current = nextRotation;
        setRotation(nextRotation);
      },
      onTick: (intensity) => {
        setPointerIntensity(intensity);
        setPointerTick((tick) => tick + 1);
      },
      onComplete: () => {
        finishMusic(wheel.id);
        setSpinning(false);
        setPointerIntensity(1);
        setPointerTick((tick) => tick + 1);
        revealActive.current = true;
        setRevealResult(finalResult);
        playContainmentLock();

        if (!completionSent.current) {
          completionSent.current = true;

          fetcher.submit(
            {
              intent: "complete-wheel",
              wheelId: wheel.id,
            },
            {
              method: "post",
            },
          );
        }

        onCompleted(wheel.id);
      },
    });

  }, [
    fetcher,
    finishMusic,
    themeKey,
    wheel.entries.length,
    wheel.id,
    wheel.type,
    onCompleted,
    startMusic,
    stopIdle,
    stopMusic,
  ]);

  const visibleStatus = spinning
    ? "SPINNING"
    : wheel.status;

  const actionMessage = recoveryError
    ? { error: recoveryError }
    : fetcher.data?.wheelId === wheel.id
      ? fetcher.data
      : null;

  return (
    <section
      ref={sectionRef}
      className={[
        "studio-wheel-section",
        isActive ? "studio-wheel-section-active" : "",
        wheel.type === "VALUE"
          ? "studio-wheel-section-value"
          : "",
      ].join(" ")}
      aria-current={isActive ? "true" : undefined}
      data-wheel-id={wheel.id}
      data-operator-locked={isOperatorLocked ? "true" : "false"}
      onPointerDown={() => {
        if (!isOperatorLocked || allowLockedSelection) onSelect(wheel.id);
      }}
    >
      <div className="studio-wheel-heading">
        <div>
          <p>
            {wheel.type === "VALUE"
              ? "Weighted value protocol"
              : "Confirmed participant protocol"}
          </p>

          <h2>
            <span>
              {wheel.type === "VALUE"
                ? "$"
                : sequenceNumber}
            </span>
            {wheel.label}
          </h2>
        </div>

        <span className="studio-wheel-heading-status">
          {isActive ? `ACTIVE · ${visibleStatus}` : visibleStatus}
        </span>
      </div>

      <div className="studio-wheel-layout">
        <div className="studio-wheel-display">
          <WheelCanvas
            entries={wheel.entries}
            type={wheel.type}
            themeKey={themeKey}
            rotation={rotation}
            spinning={spinning}
            duration={selectedDuration}
            pointerTick={pointerTick}
            pointerIntensity={pointerIntensity}
            winnerEntryIndex={wheel.winnerEntryIndex ?? fetcher.data?.winnerEntryIndex ?? null}
            celebrating={celebrating}
          />

          {countdownLabel ? (
            <div className="studio-broadcast-countdown" role="status" aria-live="assertive">
              <strong>{countdownLabel}</strong>
            </div>
          ) : null}

          {revealResult ? (
            <ContainmentReveal
              key={lastSpinToken.current ?? revealResult}
              result={revealResult}
              onReveal={() => {
                setResult(revealResult);
                setCelebrating(true);
                playWinnerTone();

                const theme = ASYLUM_THEMES[themeKey];

                celebrationCleanup.current?.();
                celebrationCleanup.current = createConfettiBurst({
                  primary: theme.primary,
                  secondary:
                    wheel.type === "VALUE"
                      ? theme.valuePrimary
                      : theme.secondary,
                });

                revealDismissTimer.current = window.setTimeout(() => {
                  revealActive.current = false;
                  setRevealResult(null);
                  setCelebrating(false);
                  celebrationCleanup.current?.();
                  celebrationCleanup.current = null;
                }, 5000);
              }}
            />
          ) : null}
        </div>

        <WheelConsole
          label={wheel.label}
          status={visibleStatus}
        >
          <div className="studio-console-metrics">
            <div>
              <span>Status</span>
              <strong>{visibleStatus}</strong>
            </div>

            <div>
              <span>Entries</span>
              <strong>{wheel.entries.length}</strong>
            </div>

            <div>
              <span>
                {wheel.type === "NAME"
                  ? "Unique players"
                  : "Unique values"}
              </span>
              <strong>{uniqueCount}</strong>
            </div>

            <div>
              <span>Selected duration</span>
              <strong>
                {selectedDuration
                  ? `${selectedDuration} seconds`
                  : "Not selected"}
              </strong>
            </div>
          </div>

          <div className="studio-console-controls">
            <fetcher.Form method="post" preventScrollReset onSubmit={submitReadyAction}>
              <input
                type="hidden"
                name="intent"
                value="shuffle-wheel"
              />
              <input
                type="hidden"
                name="wheelId"
                value={wheel.id}
              />

              <button
                className="studio-machine-button"
                type="submit"
                disabled={!ready || busy}
              >
                <span aria-hidden="true">⇄</span>
                <strong>
                  {wheel.type === "NAME"
                    ? "SHUFFLE ENTRIES"
                    : "SHUFFLE VALUES"}
                </strong>
                <small>Randomize wheel order</small>
              </button>
            </fetcher.Form>

            <fetcher.Form method="post" preventScrollReset onSubmit={submitReadyAction}>
              <input
                type="hidden"
                name="intent"
                value="select-duration"
              />
              <input
                type="hidden"
                name="wheelId"
                value={wheel.id}
              />

              <button
                className="studio-machine-button"
                type="submit"
                disabled={!ready || busy}
              >
                <span aria-hidden="true">◷</span>
                <strong>RANDOM TIME</strong>
                <small>Select {SPIN_DURATION_RANGE_LABEL}</small>
              </button>
            </fetcher.Form>

            <fetcher.Form method="post" preventScrollReset onSubmit={(event) => {
              if (!broadcastCountdown) return;
              event.preventDefault();
              submitSpin();
            }}>
              <input
                type="hidden"
                name="intent"
                value="spin-wheel"
              />
              <input
                type="hidden"
                name="wheelId"
                value={wheel.id}
              />

              <button
                className="studio-machine-button studio-machine-button-spin"
                type="submit"
                disabled={
                  !ready ||
                  busy ||
                  !selectedDuration
                }
              >
                <span aria-hidden="true">◉</span>
                <strong>
                  {spinning
                    ? "SPINNING"
                    : "SPIN WHEEL"}
                </strong>
                <small>Engage containment system</small>
              </button>
            </fetcher.Form>
          </div>

          <div className="studio-console-result">
            <span>
              {secondChanceResult
                ? "MAIN WINNER"
                : wheel.type === "NAME"
                ? "Winner"
                : "Selected value"}
            </span>

            <strong>{result ?? "PENDING"}</strong>

            <small>
              {result
                ? "Containment result verified"
                : "Result will be displayed here"}
            </small>
          </div>

          {secondChanceResult ? (
            <div className="studio-wheel-second-chance" aria-live="polite">
              <SecondChanceResult result={secondChanceResult} />
            </div>
          ) : null}

          {onAcceptResult && result && (
            wheel.status === "COMPLETED" ||
            (fetcher.data?.intent === "complete-wheel" && fetcher.data.wheelId === wheel.id && Boolean(fetcher.data.success))
          ) ? (
            <button
              className="studio-accept-result"
              type="button"
              disabled={resultAccepted}
              onClick={() => onAcceptResult(wheel.id)}
              aria-label={`Accept saved ${wheel.type === "VALUE" ? "value" : "winner"} ${result}`}
            >
              {resultAccepted ? "RESULT ACCEPTED" : "ACCEPT RESULT"}
            </button>
          ) : null}

          <div className="studio-console-message-region" aria-live="polite" aria-atomic="true">
            {actionMessage?.error ? (
              <div className="studio-console-message studio-console-message-error">
                {actionMessage.error}
              </div>
            ) : systemMessage ? (
              <div className="studio-console-message studio-console-message-success">
                {systemMessage}
              </div>
            ) : actionMessage?.success && actionMessage.intent !== "spin-wheel" ? (
              <div className="studio-console-message studio-console-message-success">
                {actionMessage.success}
              </div>
            ) : null}
          </div>

          <details className="studio-entry-preview">
            <summary>
              View current wheel order
            </summary>

            <div>
              {wheel.entries.map(
                (entry, index) => (
                  <p key={`${wheel.id}-${index}`}>
                    <span>#{index + 1}</span>
                    <strong>
                      {entryLabel(entry)}
                    </strong>
                  </p>
                ),
              )}
            </div>
          </details>
        </WheelConsole>
      </div>
    </section>
  );
});
