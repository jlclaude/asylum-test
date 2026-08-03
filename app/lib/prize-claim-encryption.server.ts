import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const AAD = Buffer.from("asylum:prize-claim-token:v1", "utf8");

function encryptionKey(encodedKey = process.env.PRIZE_CLAIM_ENCRYPTION_KEY) {
  if (!encodedKey) {
    throw new Error("Prize claim token encryption is not configured.");
  }

  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error("Prize claim token encryption is not configured correctly.");
  }

  return key;
}

export function encryptPrizeClaimToken(
  token: string,
  encodedKey?: string,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(encodedKey), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptPrizeClaimToken(
  payload: string,
  encodedKey?: string,
) {
  const [version, ivValue, ciphertextValue, tagValue, extra] =
    payload.split(".");
  if (
    version !== VERSION ||
    !ivValue ||
    !ciphertextValue ||
    !tagValue ||
    extra
  ) {
    throw new Error("Prize claim token could not be decrypted.");
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      encryptionKey(encodedKey),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Prize claim token could not be decrypted.");
  }
}
