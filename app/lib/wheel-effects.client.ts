import {
  getWinningRestRotation,
  normalizeDegrees,
} from "./wheel-geometry.ts";

export type WheelAnimationController = {
  cancel: () => void;
};

type AnimateWheelIdleOptions = {
  startRotation: number;
  onFrame: (rotation: number) => void;
  secondsPerTurn?: number;
};

export function idleRotationAt(
  startRotation: number,
  elapsedMilliseconds: number,
  secondsPerTurn = 28,
) {
  return startRotation + elapsedMilliseconds * (360 / (secondsPerTurn * 1000));
}

export function animateWheelIdle({
  startRotation,
  onFrame,
  secondsPerTurn = 28,
}: AnimateWheelIdleOptions): WheelAnimationController {
  if (
    typeof window === "undefined" ||
    typeof performance === "undefined" ||
    typeof requestAnimationFrame === "undefined" ||
    typeof cancelAnimationFrame === "undefined" ||
    !Number.isFinite(startRotation) ||
    !Number.isFinite(secondsPerTurn) ||
    secondsPerTurn <= 0
  ) {
    return { cancel: () => undefined };
  }

  let canceled = false;
  let frameId = 0;
  const startedAt = performance.now();

  const frame = (now: number) => {
    if (canceled) return;
    onFrame(idleRotationAt(startRotation, now - startedAt, secondsPerTurn));
    frameId = requestAnimationFrame(frame);
  };

  frameId = requestAnimationFrame(frame);

  return {
    cancel: () => {
      canceled = true;
      cancelAnimationFrame(frameId);
    },
  };
}

export function remainingSpinSeconds(
  spunAt: string,
  durationSeconds: number,
  now = Date.now(),
) {
  const startedAt = Date.parse(spunAt);

  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    !Number.isFinite(now)
  ) {
    return null;
  }

  return Math.max(durationSeconds - Math.max(0, (now - startedAt) / 1000), 0);
}

type AnimateWheelSpinOptions = {
  startRotation: number;
  entryCount: number;
  winnerEntryIndex: number;
  durationSeconds: number;
  elapsedSeconds?: number;
  onFrame: (rotation: number) => void;
  onTick?: (intensity: number) => void;
  onComplete: () => void;
};

export const WHEEL_ACCELERATION_RATIO = 0.09;
export const WHEEL_MIN_DECELERATION_SECONDS = 5;
export const WHEEL_MAX_DECELERATION_SECONDS = 10;

export function getWheelSpinTiming(durationSeconds: number) {
  const duration = Math.max(durationSeconds, 1);
  const acceleration = Math.min(
    Math.max(duration * WHEEL_ACCELERATION_RATIO, 1),
    duration * 0.2,
  );
  const rangedDuration = Math.min(Math.max(duration, 25), 75);
  const decelerationTarget = WHEEL_MIN_DECELERATION_SECONDS +
    ((rangedDuration - 25) / 50) *
      (WHEEL_MAX_DECELERATION_SECONDS - WHEEL_MIN_DECELERATION_SECONDS);
  const deceleration = Math.min(decelerationTarget, duration - acceleration);
  const finalSlowdown = Math.min(
    2 + ((rangedDuration - 25) / 50) * 2,
    deceleration,
  );
  const cruise = Math.max(0, duration - acceleration - deceleration);

  return {
    duration,
    acceleration,
    accelerationEnd: acceleration,
    cruise,
    cruiseEnd: acceleration + cruise,
    decelerationStart: acceleration + cruise,
    deceleration,
    finalSlowdownStart: duration - finalSlowdown,
    nearStopStart: Math.max(0, duration - 1),
    distance: acceleration * 0.5 + cruise + deceleration * 0.5,
  };
}

function smootherStep(value: number) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

export function wheelVelocityAt(progress: number, durationSeconds = 30) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const profile = getWheelSpinTiming(durationSeconds);
  const elapsed = clamped * profile.duration;

  if (elapsed <= profile.acceleration) {
    return smootherStep(elapsed / profile.acceleration);
  }

  if (elapsed <= profile.acceleration + profile.cruise) return 1;

  const local = (elapsed - profile.acceleration - profile.cruise) / profile.deceleration;
  return 1 - smootherStep(local);
}

export function wheelPositionAt(progress: number, durationSeconds = 30) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const profile = getWheelSpinTiming(durationSeconds);
  const elapsed = clamped * profile.duration;

  if (elapsed <= profile.acceleration) {
    const local = elapsed / profile.acceleration;
    const accelerationIntegral = local ** 4 * (2.5 - 3 * local + local * local);
    return profile.acceleration * accelerationIntegral / profile.distance;
  }

  const accelerationDistance = profile.acceleration * 0.5;
  if (elapsed <= profile.acceleration + profile.cruise) {
    return (accelerationDistance + elapsed - profile.acceleration) / profile.distance;
  }

  const local = (elapsed - profile.acceleration - profile.cruise) / profile.deceleration;
  const decelerationIntegral = local - 2.5 * local ** 4 + 3 * local ** 5 - local ** 6;
  return (accelerationDistance + profile.cruise + profile.deceleration * decelerationIntegral) / profile.distance;
}

export function wheelSpinTotalDegrees(
  startRotation: number,
  entryCount: number,
  winnerEntryIndex: number,
  durationSeconds: number,
) {
  const turns = Math.max(
    14,
    Math.ceil(getWheelSpinTiming(durationSeconds).distance * 0.9),
  );
  const currentNormalized = normalizeDegrees(startRotation);
  const targetNormalized = getWinningRestRotation({
    entryCount,
    winnerEntryIndex,
  });
  const correction = (targetNormalized - currentNormalized + 360) % 360;
  return turns * 360 + correction;
}

let sharedAudioContext: AudioContext | null = null;
let wheelAudioMuted = false;

export function setWheelAudioMuted(muted: boolean) {
  wheelAudioMuted = muted;
}

export function isWheelAudioMuted() {
  return wheelAudioMuted;
}

function getAudioContext() {
  if (typeof window === "undefined") return null;

  try {
    sharedAudioContext ??= new AudioContext();
  } catch {
    return null;
  }

  return sharedAudioContext;
}

function playTick(intensity: number) {
  try {
    if (wheelAudioMuted) return;
    const context = getAudioContext();
    if (!context) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.value = 420 + intensity * 260;

    const now = context.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      0.025 + intensity * 0.025,
      now + 0.003,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(now);
    oscillator.stop(now + 0.05);
  } catch {
    // Audio must never interrupt wheel animation.
  }
}

export function playWinnerTone() {
  try {
    if (wheelAudioMuted) return;
    const context = getAudioContext();
    if (!context) return;

    const now = context.currentTime;
    const notes = [392, 523.25, 659.25, 783.99];

    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = index % 2 === 0 ? "sawtooth" : "triangle";
      oscillator.frequency.value = frequency;

      const start = now + index * 0.09;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(start);
      oscillator.stop(start + 0.45);
    });
  } catch {
    // Audio must never block the saved result.
  }
}

export function playContainmentLock() {
  try {
    if (wheelAudioMuted) return;
    const context = getAudioContext();
    if (!context) return;

    const now = context.currentTime;
    [118, 82].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.12;

      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * 0.72,
        start + 0.18,
      );
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.075, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.25);
    });
  } catch {
    // Audio must never block the reveal.
  }
}

export function animateWheelSpin(
  options: AnimateWheelSpinOptions,
): WheelAnimationController {
  const {
    startRotation,
    entryCount,
    winnerEntryIndex,
    durationSeconds,
    elapsedSeconds = 0,
    onFrame,
    onTick,
    onComplete,
  } = options;

  if (
    typeof window === "undefined" ||
    typeof performance === "undefined" ||
    typeof requestAnimationFrame === "undefined" ||
    typeof cancelAnimationFrame === "undefined" ||
    !Number.isFinite(startRotation) ||
    !Number.isInteger(entryCount) ||
    entryCount <= 0 ||
    !Number.isInteger(winnerEntryIndex) ||
    winnerEntryIndex < 0 ||
    winnerEntryIndex >= entryCount ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    !Number.isFinite(elapsedSeconds) ||
    elapsedSeconds < 0 ||
    elapsedSeconds >= durationSeconds
  ) {
    return { cancel: () => undefined };
  }

  let canceled = false;
  let frameId = 0;

  const segmentDegrees = 360 / entryCount;
  const totalDegrees = wheelSpinTotalDegrees(
    startRotation,
    entryCount,
    winnerEntryIndex,
    durationSeconds,
  );
  const timing = getWheelSpinTiming(durationSeconds);
  if (import.meta.env?.DEV) {
    console.debug("[Asylum wheel] spin profile", {
      totalDurationSeconds: durationSeconds,
      accelerationEndSeconds: timing.accelerationEnd,
      cruiseEndSeconds: timing.cruiseEnd,
      decelerationStartSeconds: timing.decelerationStart,
      finalSlowdownStartSeconds: timing.finalSlowdownStart,
      nearStopStartSeconds: timing.nearStopStart,
      resumedAtSeconds: elapsedSeconds,
      totalRotationDegrees: totalDegrees,
    });
  }
  const resumedRotation = startRotation + totalDegrees *
    wheelPositionAt(elapsedSeconds / durationSeconds, durationSeconds);
  const segmentAtPointer = (rotation: number) => Math.floor(
    (((90 - rotation) % 360) + 360) % 360 / segmentDegrees,
  );
  let previousSegment = segmentAtPointer(resumedRotation);

  const startedAt = performance.now();
  const durationMs = durationSeconds * 1000;
  const elapsedMs = elapsedSeconds * 1000;

  function frame(now: number) {
    if (canceled) return;

    const rawProgress = Math.min(
      (elapsedMs + now - startedAt) / durationMs,
      1,
    );
    const easedProgress = wheelPositionAt(rawProgress, durationSeconds);
    const rotation = startRotation + totalDegrees * easedProgress;

    onFrame(rotation);

    const currentSegment = segmentAtPointer(rotation);

    if (currentSegment !== previousSegment) {
      const decelerationStart = timing.decelerationStart / durationSeconds;
      const velocity = wheelVelocityAt(rawProgress, durationSeconds);
      const intensity = rawProgress >= decelerationStart
        ? 0.4 + (1 - velocity) * 0.6
        : 0.3;
      playTick(intensity);
      onTick?.(intensity);
      previousSegment = currentSegment;
    }

    if (rawProgress < 1) {
      frameId = requestAnimationFrame(frame);
      return;
    }

    if (import.meta.env?.DEV) {
      console.debug("[Asylum wheel] trajectory complete", {
        totalDurationSeconds: durationSeconds,
        completedAtSeconds: durationSeconds,
      });
    }
    onComplete();
  }

  frameId = requestAnimationFrame(frame);

  return {
    cancel: () => {
      canceled = true;
      cancelAnimationFrame(frameId);
    },
  };
}

type ConfettiOptions = {
  primary: string;
  secondary: string;
};

export function createConfettiBurst(options: ConfettiOptions) {
  if (typeof document === "undefined" || typeof window === "undefined") return () => undefined;

  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  layer.setAttribute("aria-hidden", "true");

  const colors = [
    "#f5d76e",
    "#d6a928",
    options.primary,
    options.secondary,
  ];

  for (let index = 0; index < 90; index += 1) {
    const piece = document.createElement("span");
    piece.className = index % 5 === 0 ? "confetti-piece confetti-spark" : "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.setProperty(
      "--fall-duration",
      `${3.2 + Math.random() * 2.4}s`,
    );
    piece.style.setProperty(
      "--drift",
      `${-130 + Math.random() * 260}px`,
    );
    piece.style.setProperty(
      "--spin",
      `${360 + Math.random() * 1080}deg`,
    );
    piece.style.animationDelay = `${Math.random() * 0.45}s`;
    piece.style.borderRadius = index % 3 === 0 ? "50%" : "2px";

    layer.appendChild(piece);
  }

  document.body.appendChild(layer);

  const removalTimer = window.setTimeout(() => {
    layer.remove();
  }, 5200);

  return () => {
    window.clearTimeout(removalTimer);
    layer.remove();
  };
}
