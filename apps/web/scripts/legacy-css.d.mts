export function transformLegacyCss(
  source: string,
  options?: { from?: string; outsideLayersBump?: number },
): Promise<{
  css: string;
  hasLayers: boolean;
  mixes: number;
  layeredBump: number;
}>;
