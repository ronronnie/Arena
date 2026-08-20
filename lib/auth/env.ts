/**
 * Environment access for Neon Auth.
 *
 * Same principle as `lib/db/env.ts`: fail loudly, but fail when someone actually asks,
 * so a missing credential never breaks a CI or preview build that has no secrets.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/** Base URL of the hosted Neon Auth instance. Neon dashboard → project → Auth. */
export function neonAuthBaseUrl(): string {
  return required('NEON_AUTH_BASE_URL', process.env.NEON_AUTH_BASE_URL);
}

/**
 * Signs the local session cookie. Ours, not Neon's — we generate it.
 * The SDK rejects anything under 32 characters; we check here so the error names the
 * variable rather than surfacing from inside the SDK.
 */
export function neonAuthCookieSecret(): string {
  const secret = required('NEON_AUTH_COOKIE_SECRET', process.env.NEON_AUTH_COOKIE_SECRET);
  if (secret.length < 32) {
    throw new Error(
      'NEON_AUTH_COOKIE_SECRET must be at least 32 characters. ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
    );
  }
  return secret;
}
