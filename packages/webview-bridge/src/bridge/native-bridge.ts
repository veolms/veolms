import type {
  BridgeEventHandler,
  NativeTransport,
} from "../transport/types.d.ts";
import type { MetadataRegistry } from "./metadata.ts";
import { createBridgeProxy } from "./proxy.ts";
import { evictBridgeSession } from "./build-native-bridge.ts";

/**
 * Concrete session container for initialized NativeBridge instances.
 */
export class NativeBridgeSession {
  public readonly endpointName: string;
  public readonly transport: NativeTransport;
  public readonly metadata: MetadataRegistry;
  private rootProxy: unknown = null;

  constructor(
    endpointName: string,
    transport: NativeTransport,
    metadata: MetadataRegistry,
  ) {
    this.endpointName = endpointName;
    this.transport = transport;
    this.metadata = metadata;
  }

  /**
   * Returns a cached typed Proxy object matching frontend contract T.
   */
  public getProxy<T extends object>(): T {
    if (!this.rootProxy) {
      this.rootProxy = createBridgeProxy<T>(
        this.transport,
        this.metadata,
        "",
        this,
      );
    }
    return this.rootProxy as T;
  }

  /**
   * Subscribe to native events directly via session.
   */
  public onEvent(eventName: string, handler: BridgeEventHandler): () => void {
    return this.transport.onEvent(eventName, handler);
  }

  /**
   * Dispose bridge session, remove from session cache if current owner, and clean up underlying transport.
   */
  public dispose(): void {
    this.rootProxy = null;
    evictBridgeSession(this.endpointName, this);
    this.transport.dispose();
  }
}
