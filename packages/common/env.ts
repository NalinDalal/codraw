/**
 * Startup environment validation.
 * Shared between HTTP and WS backends to ensure consistent checks.
 *
 * @param requiredVars - Environment variable names that must be set (defaults to `["JWT_SECRET"]`)
 *
 * @module env
 */

export function validateEnv(requiredVars: string[] = ["JWT_SECRET", "DATABASE_URL"]) {
  const missing = requiredVars.filter((k) => !Bun.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    Bun.exit(1);
  }
  if (Bun.env.JWT_SECRET === "your-secret-key-change-me") {
    console.error("JWT_SECRET must be changed from the default value");
    Bun.exit(1);
  }
}

/**
 * Get the validated JWT secret.
 * Must be called after `validateEnv()` has run.
 * @returns The JWT_SECRET environment variable value
 */
export function getJwtSecret(): string {
  return Bun.env.JWT_SECRET!;
}
