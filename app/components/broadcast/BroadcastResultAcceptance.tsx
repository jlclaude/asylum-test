import { useEffect, useRef } from "react";

type Props = {
  type: "NAME" | "VALUE";
  result: string;
  accepted: boolean;
  onAccept: () => void;
};

export function BroadcastResultAcceptance({ type, result, accepted, onAccept }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    buttonRef.current?.focus({ preventScroll: true });
  }, [result]);

  return (
    <section className="broadcast-result-acceptance" aria-labelledby="broadcast-result-heading" tabIndex={-1}>
      <span>Persisted containment result</span>
      <h2 id="broadcast-result-heading">{type === "VALUE" ? "VALUE VERIFIED" : "WINNER VERIFIED"}</h2>
      <strong>{result}</strong>
      <button
        ref={buttonRef}
        type="button"
        disabled={accepted}
        aria-label={`Accept saved ${type === "VALUE" ? "value" : "winner"} ${result}`}
        onClick={onAccept}
      >
        {accepted ? "RESULT ACCEPTED" : "ACCEPT RESULT"}
      </button>
    </section>
  );
}
