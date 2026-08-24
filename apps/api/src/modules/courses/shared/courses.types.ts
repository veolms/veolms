import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { AppServices } from "../../../services/index.ts";

export interface CoursesModuleOptions {
  database: Kysely<Database>;
  services: AppServices;
}
