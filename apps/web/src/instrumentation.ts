/**
 * Runs once per server start: creates or updates Better Auth's tables in `oro_auth`.
 * Additive only (getMigrations refuses unsafe changes), so it is safe on every boot.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.SKIP_AUTH_MIGRATE === "1") return;
  try {
    const [{ getMigrations }, { auth }] = await Promise.all([import("better-auth/db/migration"), import("@/lib/server/auth")]);
    const { runMigrations, toBeCreated, toBeAdded } = await getMigrations(auth.options);
    if (toBeCreated.length || toBeAdded.length) {
      await runMigrations();
      console.info(`[auth] migrated: ${toBeCreated.map((t) => t.table).join(", ") || "columns added"}`);
    }
  } catch (err) {
    // The site still serves Parakh and the demo Room without accounts; sign-in shows an error.
    console.error("[auth] migration skipped:", (err as Error).message);
  }
}
