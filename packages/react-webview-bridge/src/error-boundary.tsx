import { Component, type ErrorInfo, type ReactNode } from "react";

export interface BridgeErrorBoundaryProps {
  /** Rendered instead of the children after an error. */
  fallback: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** Reported once per caught error. */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** When any value changes (shallow), the boundary resets. */
  resetKeys?: readonly unknown[];
  children?: ReactNode;
}

interface BridgeErrorBoundaryState {
  error: Error | null;
}

/**
 * Minimal error boundary for bridge-dependent UI (e.g. components that throw on a
 * `BridgeNotReadyError` or render-time contract violations). Bridge calls are async, so errors
 * from `call`/`useBridgeCall` reach it only if you rethrow them during render.
 */
export class BridgeErrorBoundary extends Component<
  BridgeErrorBoundaryProps,
  BridgeErrorBoundaryState
> {
  override state: BridgeErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BridgeErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  override componentDidUpdate(prev: BridgeErrorBoundaryProps): void {
    if (
      this.state.error &&
      !shallowEqual(prev.resetKeys, this.props.resetKeys)
    ) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      const { fallback } = this.props;
      return typeof fallback === "function"
        ? fallback(error, this.reset)
        : fallback;
    }
    return this.props.children;
  }
}

function shallowEqual(
  a: readonly unknown[] = [],
  b: readonly unknown[] = [],
): boolean {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}
