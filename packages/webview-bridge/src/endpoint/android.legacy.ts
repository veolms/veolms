import type {
  AndroidJavascriptInterfaceObject,
  NativeEndpoint,
  NativeMessageHandler,
} from "./types.d.ts";
import {
  getGlobalWindowProperty,
  safelyDispatchHandlers,
  sanitizeIdentifier,
} from "./utils.ts";

/**
 * Global window receiver interface for legacy native-to-JS callbacks.
 */
type LegacyReceiverFunction = (rawMessage: string) => void;

/**
 * Android Legacy Endpoint using WebView `addJavascriptInterface`.
 *
 * Supports both:
 * 1. Synchronous string return values from native `@JavascriptInterface fun postMessage(rawJson: String): String?`
 * 2. Asynchronous native dispatches to `window.__<sanitizedName>_legacy_receive__(message)`
 */
export class AndroidLegacyEndpoint implements NativeEndpoint {
  public readonly name: string;
  public readonly platform = "android-legacy" as const;

  private readonly listeners = new Set<NativeMessageHandler>();
  private targetObject: AndroidJavascriptInterfaceObject | null = null;
  private readonly callbackName: string;
  private isDisposed = false;

  constructor(name: string) {
    this.name = name;
    this.callbackName = `__${sanitizeIdentifier(name)}_legacy_receive__`;
    this.initialize();
  }

  /**
   * Static detector: checks if Android Legacy `addJavascriptInterface` object is available on `window`.
   */
  public static isAvailable(name: string): boolean {
    const obj = getGlobalWindowProperty<AndroidJavascriptInterfaceObject>(name);
    if (!obj || typeof obj.postMessage !== "function") {
      return false;
    }
    // Android Legacy interface does NOT have addEventListener or onmessage properties
    return (
      !("onmessage" in obj) &&
      typeof (obj as unknown as Record<string, unknown>).addEventListener !==
        "function"
    );
  }

  private initialize(): void {
    const obj = getGlobalWindowProperty<AndroidJavascriptInterfaceObject>(
      this.name,
    );
    if (!obj || typeof obj.postMessage !== "function") {
      throw new Error(
        `Android Legacy interface "${this.name}" is not available on window.`,
      );
    }

    this.targetObject = obj;

    // Install scoped global receiver on window so native evaluateJavascript can invoke it for async dispatches
    if (typeof window !== "undefined") {
      const windowRecord = window as unknown as Record<string, unknown>;

      const receiver: LegacyReceiverFunction = (rawMessage: string) => {
        if (this.isDisposed) {
          return;
        }
        if (typeof rawMessage === "string") {
          safelyDispatchHandlers(this.listeners, rawMessage);
        }
      };

      windowRecord[this.callbackName] = receiver;
    }
  }

  public postMessage(message: string): void {
    if (this.isDisposed || !this.targetObject) {
      throw new Error(
        `Android Legacy endpoint "${this.name}" is disposed or unavailable.`,
      );
    }

    try {
      // Execute postMessage call on injected Android JavascriptInterface object
      const result = this.targetObject.postMessage(message);

      // Handle synchronous return string from native @JavascriptInterface method
      if (result !== undefined && result !== null) {
        const replyString =
          typeof result === "string" ? result : String(result);
        if (replyString.trim() !== "") {
          safelyDispatchHandlers(this.listeners, replyString);
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to post message on Android Legacy endpoint "${this.name}": ${
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

    // Remove legacy callback from window
    if (typeof window !== "undefined") {
      const windowRecord = window as unknown as Record<string, unknown>;
      if (this.callbackName in windowRecord) {
        delete windowRecord[this.callbackName];
      }
    }

    this.listeners.clear();
    this.targetObject = null;
  }
}
