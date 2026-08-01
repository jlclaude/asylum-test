type PaymentInstructionsCardProps = {
  instructions: string | null;
  preview?: boolean;
};

export function PaymentInstructionsCard({ instructions, preview = false }: PaymentInstructionsCardProps) {
  return (
    <section className="payment-instructions-card" aria-labelledby={preview ? "payment-preview-heading" : "payment-instructions-heading"}>
      <p className="payment-instructions-kicker">{preview ? "Public page preview" : "Payment required"}</p>
      <h3 id={preview ? "payment-preview-heading" : "payment-instructions-heading"}>HOW TO PAY FOR YOUR SPOTS</h3>
      {instructions ? (
        <p className="payment-instructions-text">{instructions}</p>
      ) : (
        <p className="payment-instructions-empty">Payment instructions have not been posted yet. Contact the host before submitting payment.</p>
      )}
      <p className="payment-instructions-note">Submitting a claim reserves your requested spots. Payment is separate from claiming, and your claim is not confirmed until payment is received and approved by the host.</p>
    </section>
  );
}
