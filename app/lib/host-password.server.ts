import argon2 from "argon2";

export const HOST_PASSWORD_MIN_LENGTH = 12;
export const HOST_PASSWORD_MAX_LENGTH = 128;

export function validateHostPassword(password: string) {
  if (password.length < HOST_PASSWORD_MIN_LENGTH)
    return `Password must be at least ${HOST_PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > HOST_PASSWORD_MAX_LENGTH)
    return `Password must be no more than ${HOST_PASSWORD_MAX_LENGTH} characters.`;
  if (
    ["password1234", "changeme1234", "asylumgames"].includes(
      password.toLowerCase(),
    )
  )
    return "Choose a less common password.";
  return null;
}

export function hashHostPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyHostPassword(hash: string, password: string) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
