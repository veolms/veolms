import {
  createThemePresetInputSchema,
  systemConfigItemSchema,
  systemConfigResponseSchema,
  themeListResponseSchema,
  themePresetSchema,
  updateSystemConfigItemSchema,
  updateThemePresetInputSchema,
  userPreferencesSchema,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthContext } from "../auth/shared/auth.context.ts";
import * as repository from "./system-config.repository.ts";

const namespaceKeyParamsSchema = z.object({
  namespace: z.string(),
  key: z.string(),
});

const themeSlugParamsSchema = z.object({
  slug: z.string(),
});

const systemConfigRoutes: RoutePlugin = async (app, options) => {
  const { authenticated, middleware } = createAuthContext(options);
  const { database } = options;

  // --- Public Endpoints ------------------------------------------------------

  app.get(
    "/system/config",
    {
      schema: {
        operationId: "getSystemConfig",
        tags: ["SystemConfig"],
        summary: "Get public system configuration",
        description: "Returns public branding, theme, layout, and feature flag settings.",
        response: {
          200: jsonResponse(
            "System configuration settings.",
            systemConfigResponseSchema,
          ),
        },
      },
    },
    async () => {
      return repository.getSystemConfig(database);
    },
  );

  app.get(
    "/system/themes",
    {
      schema: {
        operationId: "getSystemThemes",
        tags: ["SystemConfig"],
        summary: "Get available active theme presets",
        description: "Returns list of active themes and CSS tokens.",
        response: {
          200: jsonResponse(
            "List of active theme presets.",
            themeListResponseSchema,
          ),
        },
      },
    },
    async () => {
      const themes = await repository.getActiveThemePresets(database);
      return { themes };
    },
  );

  // --- Authenticated User Endpoints -----------------------------------------

  app.get(
    "/me/preferences",
    {
      preHandler: authenticated,
      schema: {
        operationId: "getUserPreferences",
        tags: ["SystemConfig"],
        summary: "Get authenticated user preferences",
        description: "Returns saved UI, sidebar, and learning preferences for the logged-in user.",
        response: {
          200: jsonResponse(
            "User preferences.",
            userPreferencesSchema,
          ),
        },
      },
    },
    async (request: FastifyRequest) => {
      const user = request.user!;
      const prefs = await repository.getUserPreferences(database, user.id);
      return prefs ?? {};
    },
  );

  app.patch(
    "/me/preferences",
    {
      preHandler: authenticated,
      schema: {
        operationId: "updateUserPreferences",
        tags: ["SystemConfig"],
        summary: "Update authenticated user preferences",
        description: "Partially updates and saves user UI, sidebar, and learning preferences.",
        body: userPreferencesSchema,
        response: {
          200: jsonResponse(
            "Updated user preferences.",
            userPreferencesSchema,
          ),
        },
      },
    },
    async (request: FastifyRequest) => {
      const user = request.user!;
      const updates = request.body as Record<string, unknown>;
      const prefs = await repository.upsertUserPreferences(database, user.id, updates);
      return prefs ?? {};
    },
  );

  // --- Admin Endpoints -------------------------------------------------------

  app.get(
    "/admin/system/config",
    {
      preHandler: [middleware.authenticate, middleware.requirePermission("admin/system/config:read")],
      schema: {
        operationId: "getAllSystemConfigsAdmin",
        tags: ["AdminSystemConfig"],
        summary: "Get all system configuration items (Admin)",
        description: "Returns all system config items including non-public ones.",
        response: {
          200: jsonResponse(
            "List of system config items.",
            z.object({ items: z.array(systemConfigItemSchema) }),
          ),
        },
      },
    },
    async () => {
      const items = await repository.getAllSystemConfigsAdmin(database);
      return { items };
    },
  );

  app.put(
    "/admin/system/config/:namespace/:key",
    {
      preHandler: [middleware.authenticate, middleware.requirePermission("admin/system/config:update")],
      schema: {
        operationId: "updateSystemConfigAdmin",
        tags: ["AdminSystemConfig"],
        summary: "Update or create a system config item (Admin)",
        params: namespaceKeyParamsSchema,
        body: updateSystemConfigItemSchema,
        response: {
          200: jsonResponse(
            "Updated system configuration.",
            systemConfigResponseSchema,
          ),
        },
      },
    },
    async (request) => {
      const adminUser = request.user!;
      const { namespace, key } = request.params;
      const body = request.body;
      return repository.updateSystemConfigAdmin(database, adminUser.id, namespace, key, body);
    },
  );

  app.get(
    "/admin/system/themes",
    {
      preHandler: [middleware.authenticate, middleware.requirePermission("admin/system/themes:read")],
      schema: {
        operationId: "getAllThemesAdmin",
        tags: ["AdminSystemConfig"],
        summary: "Get all theme presets including inactive ones (Admin)",
        response: {
          200: jsonResponse(
            "List of all theme presets.",
            themeListResponseSchema,
          ),
        },
      },
    },
    async () => {
      const themes = await repository.getAllThemePresetsAdmin(database);
      return { themes };
    },
  );

  app.post(
    "/admin/system/themes",
    {
      preHandler: [middleware.authenticate, middleware.requirePermission("admin/system/themes:create")],
      schema: {
        operationId: "createThemePresetAdmin",
        tags: ["AdminSystemConfig"],
        summary: "Create a new theme preset (Admin)",
        body: createThemePresetInputSchema,
        response: {
          200: jsonResponse(
            "Updated active theme presets.",
            themeListResponseSchema,
          ),
        },
      },
    },
    async (request) => {
      const adminUser = request.user!;
      const body = request.body;
      const themes = await repository.createThemePresetAdmin(database, adminUser.id, body);
      return { themes };
    },
  );

  app.put(
    "/admin/system/themes/:slug",
    {
      preHandler: [middleware.authenticate, middleware.requirePermission("admin/system/themes:update")],
      schema: {
        operationId: "updateThemePresetAdmin",
        tags: ["AdminSystemConfig"],
        summary: "Update an existing theme preset (Admin)",
        params: themeSlugParamsSchema,
        body: updateThemePresetInputSchema,
        response: {
          200: jsonResponse(
            "Updated active theme presets.",
            themeListResponseSchema,
          ),
        },
      },
    },
    async (request) => {
      const adminUser = request.user!;
      const { slug } = request.params;
      const body = request.body as Record<string, unknown>;
      const themes = await repository.updateThemePresetAdmin(database, adminUser.id, slug, body);
      return { themes: themes ?? [] };
    },
  );

  app.delete(
    "/admin/system/themes/:slug",
    {
      preHandler: [middleware.authenticate, middleware.requirePermission("admin/system/themes:delete")],
      schema: {
        operationId: "deleteThemePresetAdmin",
        tags: ["AdminSystemConfig"],
        summary: "Soft-delete a theme preset (Admin)",
        params: themeSlugParamsSchema,
        response: {
          200: jsonResponse(
            "Soft delete result",
            z.object({ success: z.boolean() }),
          ),
        },
      },
    },
    async (request) => {
      const adminUser = request.user!;
      const { slug } = request.params;
      const success = await repository.deleteThemePresetAdmin(database, adminUser.id, slug);
      return { success };
    },
  );
};

export default systemConfigRoutes;
