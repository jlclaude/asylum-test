import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFetcher } from "react-router";

import {
  animateWheelSpin,
  createConfettiBurst,
  playWinnerTone,
  type WheelAnimationController,
} from "../../lib/wheel-effects.client";
import {
  ASYLUM_THEMES,
  type AsylumThemeKey,
} from "../../lib/asylum-themes";
import { WheelCanvas } from "./WheelCanvas";
import { WheelConsole } from "./WheelConsole";
import type {
  WheelActionData,
  WheelData,
} from "./types";

type WheelSectionProps = {
  wheel: WheelData;
  themeKey: AsylumThemeKey;
  sequenceNumber: number;
};

function entryLabel(
  entry: WheelData["entries"][number],
) {
  return "displayName" in entry
    ? entry.displayName
    : entry.value;
}

export function WheelSection({
  wheel,
  themeKey,
  sequenceNumber,
}: WheelSectionProps) {
  const fetcher = useFetcher<WheelActionData>();
  const lastSpinToken = useRef<string | null>(null);
  const completionSent = useRef(false);
  const animationController =
    useRef<WheelAnimationController | null>(null);

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(
    wheel.status === "SPINNING",
  );

  const [result, setResult] = useState<string | null>(
    wheel.status === "COMPLETED"
      ? wheel.winnerDisplayName ?? wheel.winnerValue
      : null,
  );

  const selectedDuration =
    fetcher.data?.wheelId === wheel.id &&
    fetcher.data.spinDurationSeconds
      ? fetcher.data.spinDurationSeconds
      : wheel.spinDurationSeconds;

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
    if (wheel.status === "COMPLETED") {
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
    setSpinning(true);

    animationController.current?.cancel();

    animationController.current = animateWheelSpin({
      startRotation: rotation,
      entryCount: wheel.entries.length,
      winnerEntryIndex: data.winnerEntryIndex,
      durationSeconds: data.spinDurationSeconds,
      onFrame: setRotation,
      onComplete: () => {
        setResult(finalResult);
        setSpinning(false);
        playWinnerTone();

        const theme = ASYLUM_THEMES[themeKey];

        createConfettiBurst({
          primary: theme.primary,
          secondary:
            wheel.type === "VALUE"
              ? theme.valuePrimary
              : theme.secondary,
        });

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
      },
    });

    return () => {
      animationController.current?.cancel();
    };
  }, [
    fetcher,
    rotation,
    themeKey,
    wheel.entries.length,
    wheel.id,
    wheel.type,
  ]);

  const busy =
    fetcher.state !== "idle" ||
    spinning;

  const ready =
    wheel.status === "READY" &&
    !spinning;

  const visibleStatus = spinning
    ? "SPINNING"
    : wheel.status;

  const actionMessage =
    fetcher.data?.wheelId === wheel.id
      ? fetcher.data
      : null;

  return (
    <section
      className={[
        "studio-wheel-section",
        wheel.type === "VALUE"
          ? "studio-wheel-section-value"
          : "",
      ].join(" ")}
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
          {visibleStatus}
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
          />
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
              <span>Spin time</span>
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

            <fetcher.Form method="post">
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
}
