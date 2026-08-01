import { useEffect, useRef, useState } from "react";

type RevealPhase = "lock" | "verifying" | "revealed";

type ContainmentRevealProps = {
  result: string;
  onReveal: () => void;
};

export function getContainmentRevealTiming(reducedMotion: boolean) {
  return reducedMotion
    ? { verifyingAt: 0, revealAt: 0 }
    : { verifyingAt: 850, revealAt: 2200 };
}

export function ContainmentReveal({
  result,
  onReveal,
}: ContainmentRevealProps) {
  const [phase, setPhase] = useState<RevealPhase>("lock");
  const revealed = useRef(false);
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timing = getContainmentRevealTiming(reducedMotion);

    if (timing.revealAt === 0) {
      setPhase("revealed");

      if (!revealed.current) {
        revealed.current = true;
        onRevealRef.current();
      }

      return;
    }

    const verifyingTimer = window.setTimeout(() => {
      setPhase("verifying");
    }, timing.verifyingAt);

    const revealTimer = window.setTimeout(() => {
      setPhase("revealed");

      if (!revealed.current) {
        revealed.current = true;
        onRevealRef.current();
      }
    }, timing.revealAt);

    return () => {
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

      {phase === "lock" ? (
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
