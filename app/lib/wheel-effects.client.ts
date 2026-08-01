export type WheelAnimationController = {
  cancel: () => void;
};

type AnimateWheelSpinOptions = {
  startRotation: number;
  entryCount: number;
  winnerEntryIndex: number;
  durationSeconds: number;
  onFrame: (rotation: number) => void;
  onComplete: () => void;
};

let sharedAudioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;

  sharedAudioContext ??= new AudioContext();
  return sharedAudioContext;
}

function playTick(intensity: number) {
  const context = getAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "square";
  oscillator.frequency.value = 520 + intensity * 320;

  const now = context.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(
    0.025 + intensity * 0.02,
    now + 0.004,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(now);
  oscillator.stop(now + 0.05);
}

export function playWinnerTone() {
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
}

function easeWheel(progress: number) {
  if (progress < 0.16) {
    const local = progress / 0.16;
    return 0.14 * local * local * local;
  }

  if (progress < 0.72) {
    const local = (progress - 0.16) / 0.56;
    return 0.14 + local * 0.61;
  }

  const local = (progress - 0.72) / 0.28;
  const eased = 1 - Math.pow(1 - local, 4);
  return 0.75 + eased * 0.25;
}

export function animateWheelSpin(
  options: AnimateWheelSpinOptions,
): WheelAnimationController {
  const {
    startRotation,
    entryCount,
    winnerEntryIndex,
    durationSeconds,
    onFrame,
    onComplete,
  } = options;

  let canceled = false;
  let frameId = 0;
  let previousSegment = Math.floor(
    ((startRotation % 360) + 360) % 360 / (360 / entryCount),
  );

  const segmentDegrees = 360 / entryCount;
  const targetCenter = (winnerEntryIndex + 0.5) * segmentDegrees;
  const turns = 14 + Math.ceil(durationSeconds / 4.5);
  const currentNormalized = ((startRotation % 360) + 360) % 360;
  const targetNormalized = ((360 - targetCenter) % 360 + 360) % 360;
  const correction =
    (targetNormalized - currentNormalized + 360) % 360;
  const totalDegrees = turns * 360 + correction;

  const startedAt = performance.now();
  const durationMs = durationSeconds * 1000;

  function frame(now: number) {
    if (canceled) return;

    const rawProgress = Math.min((now - startedAt) / durationMs, 1);
    const easedProgress = easeWheel(rawProgress);
    const rotation = startRotation + totalDegrees * easedProgress;

    onFrame(rotation);

    const normalized = ((rotation % 360) + 360) % 360;
    const currentSegment = Math.floor(normalized / segmentDegrees);

    if (currentSegment !== previousSegment) {
      const intensity = Math.max(0.15, 1 - rawProgress);
      playTick(intensity);
      previousSegment = currentSegment;
    }

    if (rawProgress < 1) {
      frameId = requestAnimationFrame(frame);
      return;
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
  if (typeof document === "undefined") return;

  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  layer.setAttribute("aria-hidden", "true");

  const colors = [
    options.primary,
    options.secondary,
    "#f2f2f2",
    "#171719",
  ];

  for (let index = 0; index < 110; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
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

  window.setTimeout(() => {
    layer.remove();
  }, 6500);
}
