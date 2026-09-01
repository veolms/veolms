export function bold(s: string): string {
  return `\x1b[1m${s}\x1b[0m`;
}

export function dim(s: string): string {
  return `\x1b[2m${s}\x1b[0m`;
}

export function red(s: string): string {
  return `\x1b[31m${s}\x1b[0m`;
}

export function green(s: string): string {
  return `\x1b[32m${s}\x1b[0m`;
}

export function yellow(s: string): string {
  return `\x1b[33m${s}\x1b[0m`;
}

export function cyan(s: string): string {
  return `\x1b[36m${s}\x1b[0m`;
}
