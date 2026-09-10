import { z } from "zod";

export const menuPermissionSchema = z.object({
  canCreate: z.boolean(),
  canRead: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
});

export interface SidenavMenuNode {
  id: string;
  parentId: string | null;
  label: string;
  routeLink: string;
  icon: string | null;
  expanded: boolean;
  checkList?: string | null;
  isBoth: boolean;
  permissions: z.output<typeof menuPermissionSchema>;
  children?: SidenavMenuNode[];
}

export const sidenavMenuNodeSchema: z.ZodType<SidenavMenuNode> = z.lazy(() =>
  z.object({
    id: z.uuid(),
    parentId: z.uuid().nullable(),
    label: z.string(),
    routeLink: z.string(),
    icon: z.string().nullable(),
    expanded: z.boolean(),
    checkList: z.string().nullable().optional(),
    isBoth: z.boolean(),
    permissions: menuPermissionSchema,
    children: z.array(sidenavMenuNodeSchema).optional(),
  }),
);

export const sidenavResponseSchema = z.object({
  menus: z.array(sidenavMenuNodeSchema),
  permissions: z.array(z.string().max(50)),
  roles: z.array(z.string().max(50)),
});

export type MenuPermission = z.output<typeof menuPermissionSchema>;
export type SidenavResponse = z.output<typeof sidenavResponseSchema>;

// Backwards-compatibility aliases
export const authMenuPermissionSchema = menuPermissionSchema;
export const authMenuNodeSchema = sidenavMenuNodeSchema;
export type AuthMenuPermission = MenuPermission;
export type AuthMenuNode = SidenavMenuNode;
