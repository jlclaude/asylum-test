type AsylumLogoProps = {
  className?: string;
  decorative?: boolean;
};

export function AsylumLogo({ className = "", decorative = false }: AsylumLogoProps) {
  return (
    <img
      className={["asylum-logo-image", className].filter(Boolean).join(" ")}
      src="/images/logo.png"
      alt={decorative ? "" : "Asylum Games"}
      width={3024}
      height={4032}
      decoding="async"
    />
  );
}
