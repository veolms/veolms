/**
 * Callback handler for raw incoming messages from native.
 * Operating exclusively on raw string payloads.
 */
export type NativeMessageHandler = (message: string) => void;

/**
 * Platform endpoint classifier.
 */
export type EndpointPlatform =
  "android-modern" | "android-legacy" | "ios" | "unknown";

/**
 * Lowest-level JavaScript abstraction over platform WebView message channels.
 * Operates purely on strings and has no knowledge of protocol JSON, request IDs,
 * promises, metadata, or application contracts.
 */
export interface NativeEndpoint {
  /** The endpoint registration name (e.g. "NativeBridge") */
  readonly name: string;

  /** The detected underlying platform mechanism */
  readonly platform: EndpointPlatform;

  /**
   * Post a raw string message to the native platform handler.
   * Throws if the underlying native endpoint is unavailable or disconnected.
   */
  postMessage(message: string): void;

  /**
   * Subscribe a message handler to receive incoming raw string messages from native.
   * Returns an unsubscribe function.
   */
  onMessage(handler: NativeMessageHandler): () => void;

  /**
   * Clean up all native message listeners, window callback handlers, and resources.
   */
  dispose(): void;
}

/**
 * WebMessage event interface injected by Android WebView addWebMessageListener.
 */
export interface WebMessageObject {
  data?: unknown;
  origin?: string;
  ports?: unknown[];
}

/**
 * Window object listener interface injected by Android WebView addWebMessageListener.
 */
export interface AndroidWebMessageListenerObject {
  postMessage(message: string): void;
  onmessage?: ((event: WebMessageObject) => void) | null;
  addEventListener?(
    type: string,
    listener: (event: WebMessageObject) => void,
  ): void;
  removeEventListener?(
    type: string,
    listener: (event: WebMessageObject) => void,
  ): void;
}

/**
 * Window object interface injected by Android WebView addJavascriptInterface.
 * In Android Java/Kotlin, @JavascriptInterface methods can return String synchronously,
 * or void with asynchronous callback dispatches.
 */
export interface AndroidJavascriptInterfaceObject {
  postMessage(message: string): unknown;
}

/**
 * iOS WebKit script message handler interface.
 */
export interface WKScriptMessageHandlerObject {
  postMessage(message: unknown): Promise<unknown> | void;
}

/**
 * iOS WebKit message handlers container interface on window.webkit.messageHandlers.
 */
export interface WKWebkitContainer {
  messageHandlers?: Record<string, WKScriptMessageHandlerObject | undefined>;
}
