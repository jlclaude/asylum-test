import { createHash, timingSafeEqual } from "node:crypto";

function same(valueA: string, valueB: string) {
  const a = Buffer.from(valueA);
  const b = Buffer.from(valueB);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireSameOrigin(request: Request) {
  const expected = new URL(request.url).origin;
  const supplied =
    request.headers.get("Origin") ?? request.headers.get("Referer");
  if (!supplied || new URL(supplied).origin !== expected)
    throw new Response("Invalid request origin.", { status: 403 });
}

export function verifyHostCsrfToken(rawToken: string, storedHash: string) {
  const actual = createHash("sha256").update(rawToken).digest("hex");
  if (!rawToken || !same(actual, storedHash))
    throw new Response(
      "Invalid security token. Refresh the page and try again.",
      { status: 403 },
    );
}
