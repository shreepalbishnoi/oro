/**
 * Reads an optional setting. Empty values and all-x stand-ins (the `xxxxx` in .env.example)
 * count as "not configured", so a copied example file never switches a feature on half-set.
 */
export function optionalEnv(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v && !/^x+$/i.test(v) ? v : undefined;
}
