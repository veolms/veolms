/**
 * Lucide React 1.31.0 ships ESM icon leaf modules but no package export map or
 * per-leaf declarations. Keep those internal paths typed and centralized in
 * the icon registry; review them whenever the Lucide version is upgraded.
 */
declare module "lucide-react/dist/esm/icons/*.mjs" {
  import type { LucideIcon } from "lucide-react";

  const icon: LucideIcon;
  export default icon;
}
