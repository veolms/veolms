/**
 * Shared helper for dynamically importing a provider package and retrieving
 * a  exported function by name.
 */
export async function loadModuleFunction<
  T extends (...args: never[]) => unknown,
>(
  packageName: string,
  exportName: string,
  notExportedMessage?: string,
): Promise<T> {
  const mod = (await import(packageName)) as Record<string, unknown>;

  const candidate = mod[exportName];
  if (typeof candidate === "function") {
    return candidate as T;
  }

  throw new Error(
    notExportedMessage ??
      `Module "${packageName}" does not export a function named "${exportName}".`,
  );
}
