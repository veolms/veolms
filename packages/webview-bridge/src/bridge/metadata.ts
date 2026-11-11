import type { BridgeCapability, BridgeMetadataPayload } from "./types.d.ts";
import { PATH_SEPARATOR, RESERVED_ROOT_NAMES } from "../protocol/constants.ts";

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
  /** Direct child member/namespace names per parent path ("" = root). */
  private readonly childrenByPath = new Map<string, Set<string>>();

  constructor(payload: BridgeMetadataPayload) {
    this.rawPayload = payload;
    this.protocolVersion = payload.protocolVersion;
    this.bridgeVersion = payload.bridgeVersion;
    this.sessionId = payload.sessionId;
    const shadowedRootNames = new Set<string>();

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
      const rootName = segments[0];
      if (rootName !== undefined && RESERVED_ROOT_NAMES.has(rootName)) {
        shadowedRootNames.add(rootName);
      }
      for (let i = 1; i < segments.length; i++) {
        const nsPath = segments.slice(0, i).join(PATH_SEPARATOR);
        this.knownNamespaces.add(nsPath);
      }
      if (capability.kind === "namespace") {
        this.knownNamespaces.add(capPayload.path);
      }

      // Index every segment as a child of its parent path
      let parent = "";
      for (const segment of segments) {
        let children = this.childrenByPath.get(parent);
        if (!children) {
          children = new Set<string>();
          this.childrenByPath.set(parent, children);
        }
        children.add(segment);
        parent =
          parent === "" ? segment : `${parent}${PATH_SEPARATOR}${segment}`;
      }
    }

    if (
      shadowedRootNames.size > 0 &&
      typeof console !== "undefined" &&
      typeof console.warn === "function"
    ) {
      console.warn(
        `[NativeBridge] Native exposes root member(s) ${Array.from(
          shadowedRootNames,
        )
          .map((name) => `"${name}"`)
          .join(", ")} whose names are reserved by the bridge proxy ` +
          `(${Array.from(RESERVED_ROOT_NAMES).join(", ")}); they are unreachable from JS. Rename them on native.`,
      );
    }
  }

  /**
   * Names of the direct children (members and namespaces) of `path` ("" for the root).
   */
  public childrenOf(path: string): string[] {
    return Array.from(this.childrenByPath.get(path) ?? []);
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
