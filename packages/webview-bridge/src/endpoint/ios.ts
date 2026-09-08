import type {
  NativeEndpoint,
  NativeMessageHandler,
  WKScriptMessageHandlerObject,
} from "./types.d.ts";
import {
  getNestedGlobalProperty,
  safelyDispatchHandlers,
  sanitizeIdentifier,
} from "./utils.ts";

/**
 * iOS Endpoint using WebKit message handlers (`window.webkit.messageHandlers[name]`).
 * Handles both `WKScriptMessageHandlerWithReply` (Promise return values) and unsolicited native
 * messages dispatched to `window.__<sanitizedName>_ios_receive__(message)`.
 */
export class IOSEndpoint implements NativeEndpoint {
  public readonly name: string;
  public readonly platform = "ios" as const;

  private readonly listeners = new Set<NativeMessageHandler>();
  private targetHandler: WKScriptMessageHandlerObject | null = null;
  private readonly callbackName: string;
  private isDisposed = false;

  constructor(name: string) {
    this.name = name;
    this.callbackName = `__${sanitizeIdentifier(name)}_ios_receive__`;
    this.initialize();
  }

  /**
   * Static detector: checks if iOS WebKit message handler object is available on `window.webkit.messageHandlers[name]`.
   */
  public static isAvailable(name: string): boolean {
    const handler = getNestedGlobalProperty<WKScriptMessageHandlerObject>([
      "webkit",
      "messageHandlers",
      name,
    ]);
    if (!handler || typeof handler.postMessage !== "function") {
      return false;
    }
    return true;
  }

  private initialize(): void {
    const handler = getNestedGlobalProperty<WKScriptMessageHandlerObject>([
      "webkit",
      "messageHandlers",
      this.name,
    ]);
    if (!handler || typeof handler.postMessage !== "function") {
      throw new Error(
        `iOS WebKit message handler "${this.name}" is not available.`,
      );
    }

    this.targetHandler = handler;

    // Install scoped global receiver on window for native events / standard handlers
    if (typeof window !== "undefined") {
      const windowRecord = window as unknown as Record<string, unknown>;
      windowRecord[this.callbackName] = (rawMessage: unknown) => {
        if (this.isDisposed) {
          return;
        }
        const stringMessage =
          typeof rawMessage === "string" ? rawMessage : String(rawMessage);
        safelyDispatchHandlers(this.listeners, stringMessage);
      };
    }
  }

  public postMessage(message: string): void {
    if (this.isDisposed || !this.targetHandler) {
      throw new Error(
        `iOS WebKit endpoint "${this.name}" is disposed or unavailable.`,
      );
    }

    try {
      const result = this.targetHandler.postMessage(message);

      // Handle WKScriptMessageHandlerWithReply Promise return value
      if (
        result !== null &&
        typeof result === "object" &&
        typeof (result as Promise<unknown>).then === "function"
      ) {
        (result as Promise<unknown>)
          .then((replyPayload: unknown) => {
            if (this.isDisposed) {
              return;
            }
            if (replyPayload !== undefined && replyPayload !== null) {
              const replyString =
                typeof replyPayload === "string"
                  ? replyPayload
                  : JSON.stringify(replyPayload);
              safelyDispatchHandlers(this.listeners, replyString);
            }
          })
          .catch((error: unknown) => {
            if (this.isDisposed) {
              return;
            }
            if (
              typeof console !== "undefined" &&
              typeof console.error === "function"
            ) {
              console.error(
                `iOS WebKit reply handler error for endpoint "${this.name}":`,
                error,
              );
            }
          });
      }
    } catch (error) {
      throw new Error(
        `Failed to post message on iOS WebKit endpoint "${this.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  public onMessage(handler: NativeMessageHandler): () => void {
    if (this.isDisposed) {
      return () => {};
    }
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;

    // Clean up window receiver callback
    if (typeof window !== "undefined") {
      const windowRecord = window as unknown as Record<string, unknown>;
      if (this.callbackName in windowRecord) {
        delete windowRecord[this.callbackName];
      }
    }

    this.listeners.clear();
    this.targetHandler = null;
  }
}
