/**
 * Shared helper for the "dynamically import a provider package, then pick
 * the first defined export matching one of several candidate names" pattern
 * used by the provider resolver and the infra setup/destroy dispatchers.
 */
export async function loadModuleFunction<
  T extends (...args: never[]) => unknown,
>(
  packageName: string,
  candidateExportNames: readonly string[],
  notExportedMessage: string,
): Promise<T> {
  const mod = (await import(packageName)) as Record<string, unknown>;

  for (const name of candidateExportNames) {
    const candidate = mod[name];
    if (typeof candidate === "function") {
      return candidate as T;
    }
  }

  throw new Error(notExportedMessage);
}
