import type { BridgeCapability, BridgeMetadataPayload } from "./types.d.ts";
import { PATH_SEPARATOR } from "../protocol/constants.ts";

/**
 * Registry maintaining runtime native capability metadata.
 */
export class MetadataRegistry {
  public readonly protocolVersion: number;
  public readonly bridgeVersion: string;
  public readonly sessionId: string;
  public readonly rawPayload: BridgeMetadataPayload;
  private readonly capabilitiesByPath = new Map<string, BridgeCapability>();
  private readonly knownNamespaces = new Set<string>();

  constructor(payload: BridgeMetadataPayload) {
    this.rawPayload = payload;
    this.protocolVersion = payload.protocolVersion;
    this.bridgeVersion = payload.bridgeVersion;
    this.sessionId = payload.sessionId;

    for (const capPayload of payload.capabilities) {
      const capability: BridgeCapability = {
        path: capPayload.path,
        kind: capPayload.kind,
        readable: capPayload.readable ?? true,
        writable: capPayload.writable ?? false,
      };
      this.capabilitiesByPath.set(capPayload.path, capability);

      // Index prefix namespaces (e.g. "systemBars:hideStatusBar" -> namespace "systemBars")
      const segments = capPayload.path.split(PATH_SEPARATOR);
      for (let i = 1; i < segments.length; i++) {
        const nsPath = segments.slice(0, i).join(PATH_SEPARATOR);
        this.knownNamespaces.add(nsPath);
      }
    }
  }

  public hasCapability(path: string): boolean {
    return this.capabilitiesByPath.has(path);
  }

  public getCapability(path: string): BridgeCapability | undefined {
    return this.capabilitiesByPath.get(path);
  }

  public isNamespace(path: string): boolean {
    return this.knownNamespaces.has(path);
  }

  public isFunction(path: string): boolean {
    const cap = this.capabilitiesByPath.get(path);
    return cap?.kind === "function";
  }

  public isProperty(path: string): boolean {
    const cap = this.capabilitiesByPath.get(path);
    return cap?.kind === "property";
  }

  public isReadable(path: string): boolean {
    const cap = this.capabilitiesByPath.get(path);
    return cap?.readable ?? false;
  }

  public isWritable(path: string): boolean {
    const cap = this.capabilitiesByPath.get(path);
    return cap?.writable ?? false;
  }
}
