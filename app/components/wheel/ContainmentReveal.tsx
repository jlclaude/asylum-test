import { useEffect, useRef, useState } from "react";

type RevealPhase = "settling" | "lock" | "verifying" | "revealed";

type ContainmentRevealProps = {
  result: string;
  onReveal: () => void;
};

export function getContainmentRevealTiming(reducedMotion: boolean) {
  return reducedMotion
    ? { lockAt: 0, verifyingAt: 0, revealAt: 0 }
    : { lockAt: 1000, verifyingAt: 1450, revealAt: 2200 };
}

export function ContainmentReveal({
  result,
  onReveal,
}: ContainmentRevealProps) {
  const [phase, setPhase] = useState<RevealPhase>("settling");
  const revealed = useRef(false);
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;

  useEffect(() => {
    const revealSequenceStartedAt = window.performance.now();
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timing = getContainmentRevealTiming(reducedMotion);

    if (timing.revealAt === 0) {
      setPhase("revealed");

      if (!revealed.current) {
        revealed.current = true;
        if (import.meta.env.DEV) console.debug("[Asylum wheel] reduced-motion winner reveal", { elapsedMilliseconds: 0 });
        onRevealRef.current();
      }

      return;
    }

    const lockTimer = window.setTimeout(() => {
      if (import.meta.env.DEV) console.debug("[Asylum wheel] winner reveal started", { elapsedMilliseconds: window.performance.now() - revealSequenceStartedAt });
      setPhase("lock");
    }, timing.lockAt);

    const verifyingTimer = window.setTimeout(() => {
      setPhase("verifying");
    }, timing.verifyingAt);

    const revealTimer = window.setTimeout(() => {
      setPhase("revealed");

      if (!revealed.current) {
        revealed.current = true;
        if (import.meta.env.DEV) console.debug("[Asylum wheel] celebration started", { elapsedMilliseconds: window.performance.now() - revealSequenceStartedAt, durationMilliseconds: 5000 });
        onRevealRef.current();
      }
    }, timing.revealAt);

    return () => {
      window.clearTimeout(lockTimer);
      window.clearTimeout(verifyingTimer);
      window.clearTimeout(revealTimer);
    };
  }, []);

  return (
    <div
      className={`studio-containment-reveal studio-containment-reveal-${phase}`}
      role="status"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="studio-containment-reveal-warning" aria-hidden="true">
        <i />
        <span>LOCK SEQUENCE</span>
        <i />
      </div>

      {phase === "settling" ? null : phase === "lock" ? (
        <strong>CONTAINMENT LOCK</strong>
      ) : phase === "verifying" ? (
        <strong>VERIFYING</strong>
      ) : (
        <>
          <span>CONTAINMENT VERIFIED</span>
          <strong>{result}</strong>
        </>
      )}
    </div>
  );
}
