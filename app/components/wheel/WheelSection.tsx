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
import { WheelCanvas } from "./WheelCanvas";
import { WheelConsole } from "./WheelConsole";
import { ContainmentReveal } from "./ContainmentReveal";
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
}, operatorRef) {
  const sectionRef = useRef<HTMLElement>(null);
  const fetcher = useFetcher<WheelActionData>();
  const lastSpinToken = useRef<string | null>(null);
  const completionSent = useRef(false);
  const animationController =
    useRef<WheelAnimationController | null>(null);
  const revealActive = useRef(false);
  const revealDismissTimer = useRef<number | null>(null);
  const countdownTimers = useRef<number[]>([]);

  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(rotation);
  const [pointerTick, setPointerTick] = useState(0);
  const [revealResult, setRevealResult] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [countdownLabel, setCountdownLabel] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(
    wheel.status === "SPINNING",
  );

  const [result, setResult] = useState<string | null>(
    wheel.status === "COMPLETED"
      ? wheel.winnerDisplayName ?? wheel.winnerValue
      : null,
  );

  useEffect(() => {
    const timers = countdownTimers;
    return () => {
      animationController.current?.cancel();

      if (revealDismissTimer.current !== null) {
        window.clearTimeout(revealDismissTimer.current);
      }
      timers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const selectedDuration =
    fetcher.data?.wheelId === wheel.id &&
    fetcher.data.spinDurationSeconds
      ? fetcher.data.spinDurationSeconds
      : wheel.spinDurationSeconds;

  const busy = fetcher.state !== "idle" || spinning || countdownLabel !== null;
  const ready = wheel.status === "READY" && !spinning;

  const submitSpin = useCallback(() => {
    const blocked = wheelActionBlockReason("spin-wheel", {
      status: wheel.status,
      spinning,
      busy: fetcher.state !== "idle" || countdownLabel !== null,
      selectedDuration,
    });
    if (blocked) return { triggered: false, message: blocked };

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
  }, [broadcastCountdown, countdownLabel, fetcher, selectedDuration, spinning, wheel.id, wheel.label, wheel.status]);

  useImperativeHandle(operatorRef, () => ({
    runAction: (action: WheelOperatorAction) => {
      if (action === "spin-wheel") return submitSpin();
      const blocked = wheelActionBlockReason(action, { status: wheel.status, spinning, busy: fetcher.state !== "idle", selectedDuration });
      if (blocked) return { triggered: false, message: blocked };

      fetcher.submit({ intent: action, wheelId: wheel.id }, { method: "post" });
      return { triggered: true, message: `${wheel.label}: command submitted.` };
    },
    scrollIntoView: (reducedMotion: boolean) => {
      sectionRef.current?.scrollIntoView({
        behavior: wheelScrollBehavior(reducedMotion),
        block: "start",
      });
    },
  }), [fetcher, selectedDuration, spinning, submitSpin, wheel.id, wheel.label, wheel.status]);

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
      setResult(
        wheel.winnerDisplayName ??
          wheel.winnerValue,
      );
      setSpinning(false);
    }
  }, [
    wheel.status,
    wheel.winnerDisplayName,
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
      setSpinning(false);
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
    revealActive.current = false;
    setSpinning(true);
    animationController.current?.cancel();

    if (remainingSeconds === 0) {
      completeRecoveredSpin();
      return;
    }

    animationController.current = animateWheelSpin({
      startRotation: rotationRef.current,
      entryCount: wheel.entries.length,
      winnerEntryIndex: wheel.winnerEntryIndex,
      durationSeconds: remainingSeconds,
      onFrame: (nextRotation) => {
        rotationRef.current = nextRotation;
        setRotation(nextRotation);
      },
      onTick: () => {
        setPointerTick((tick) => tick + 1);
      },
      onComplete: completeRecoveredSpin,
    });
  }, [
    fetcher,
    onCompleted,
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
    revealActive.current = false;
    setSpinning(true);

    animationController.current?.cancel();

    animationController.current = animateWheelSpin({
      startRotation: rotationRef.current,
      entryCount: wheel.entries.length,
      winnerEntryIndex: data.winnerEntryIndex,
      durationSeconds: data.spinDurationSeconds,
      onFrame: (nextRotation) => {
        rotationRef.current = nextRotation;
        setRotation(nextRotation);
      },
      onTick: () => {
        setPointerTick((tick) => tick + 1);
      },
      onComplete: () => {
        setSpinning(false);
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
    themeKey,
    wheel.entries.length,
    wheel.id,
    wheel.type,
    onCompleted,
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
                playWinnerTone();

                const theme = ASYLUM_THEMES[themeKey];

                createConfettiBurst({
                  primary: theme.primary,
                  secondary:
                    wheel.type === "VALUE"
                      ? theme.valuePrimary
                      : theme.secondary,
                });

                revealDismissTimer.current = window.setTimeout(() => {
                  revealActive.current = false;
                  setRevealResult(null);
                }, 1600);
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
            <fetcher.Form method="post">
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

            <fetcher.Form method="post">
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
                <small>Select 30–120 seconds</small>
              </button>
            </fetcher.Form>

            <fetcher.Form method="post" onSubmit={(event) => {
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
              {wheel.type === "NAME"
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

          {actionMessage?.error ? (
            <div className="studio-console-message studio-console-message-error">
              {actionMessage.error}
            </div>
          ) : null}

          {actionMessage?.success &&
          actionMessage.intent !== "spin-wheel" ? (
            <div className="studio-console-message studio-console-message-success">
              {actionMessage.success}
            </div>
          ) : null}

          {systemMessage ? (
            <div className="studio-console-message studio-console-message-success" role="status">
              {systemMessage}
            </div>
          ) : null}

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
