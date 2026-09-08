import type {
  AndroidWebMessageListenerObject,
  NativeEndpoint,
  NativeMessageHandler,
  WebMessageObject,
} from "./types.d.ts";
import { getGlobalWindowProperty, safelyDispatchHandlers } from "./utils.ts";

/**
 * Android Modern Endpoint using AndroidX WebKit `addWebMessageListener`.
 * Receives messages via `window[name].onmessage` or `addEventListener('message')`.
 * Sends messages via `window[name].postMessage(message)`.
 */
export class AndroidModernEndpoint implements NativeEndpoint {
  public readonly name: string;
  public readonly platform = "android-modern" as const;

  private readonly listeners = new Set<NativeMessageHandler>();
  private targetObject: AndroidWebMessageListenerObject | null = null;
  private boundEventListener: ((event: WebMessageObject) => void) | null = null;
  private isDisposed = false;

  constructor(name: string) {
    this.name = name;
    this.initialize();
  }

  /**
   * Static detector: checks if Android Modern `addWebMessageListener` is available
   * for the given endpoint name on `window`.
   * Android Modern objects feature an `onmessage` property or `addEventListener` function.
   */
  public static isAvailable(name: string): boolean {
    const obj = getGlobalWindowProperty<AndroidWebMessageListenerObject>(name);
    if (!obj || typeof obj.postMessage !== "function") {
      return false;
    }
    // Android Modern WebMessageListener provides onmessage property or addEventListener
    return "onmessage" in obj || typeof obj.addEventListener === "function";
  }

  private initialize(): void {
    const obj = getGlobalWindowProperty<AndroidWebMessageListenerObject>(
      this.name,
    );
    if (!obj || typeof obj.postMessage !== "function") {
      throw new Error(
        `Android Modern WebMessageListener "${this.name}" is not available on window.`,
      );
    }

    this.targetObject = obj;

    // Create the message receiver callback
    this.boundEventListener = (event: WebMessageObject) => {
      if (this.isDisposed) {
        return;
      }
      let rawData: string;
      if (typeof event.data === "string") {
        rawData = event.data;
      } else if (event.data !== null && event.data !== undefined) {
        rawData = String(event.data);
      } else {
        return;
      }
      safelyDispatchHandlers(this.listeners, rawData);
    };

    // Attach via addEventListener if available, otherwise set onmessage
    if (typeof obj.addEventListener === "function") {
      obj.addEventListener("message", this.boundEventListener);
    } else {
      const existingOnMessage = obj.onmessage;
      obj.onmessage = (event: WebMessageObject) => {
        if (typeof existingOnMessage === "function") {
          try {
            existingOnMessage(event);
          } catch {
            // Isolate existing handler
          }
        }
        if (this.boundEventListener) {
          this.boundEventListener(event);
        }
      };
    }
  }

  public postMessage(message: string): void {
    if (this.isDisposed || !this.targetObject) {
      throw new Error(
        `Android Modern endpoint "${this.name}" is disposed or unavailable.`,
      );
    }
    try {
      this.targetObject.postMessage(message);
    } catch (error) {
      throw new Error(
        `Failed to post message on Android Modern endpoint "${this.name}": ${
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

    if (this.targetObject && this.boundEventListener) {
      if (typeof this.targetObject.removeEventListener === "function") {
        this.targetObject.removeEventListener(
          "message",
          this.boundEventListener,
        );
      } else if (this.targetObject.onmessage === this.boundEventListener) {
        this.targetObject.onmessage = null;
      }
    }

    this.listeners.clear();
    this.targetObject = null;
    this.boundEventListener = null;
  }
}
