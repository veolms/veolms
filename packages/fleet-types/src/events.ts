import {
  FLEET_EVENT_TYPES,
  fleetEventTypeSchema,
  type FleetEventType,
} from "@veolms/contracts";

export { FLEET_EVENT_TYPES, fleetEventTypeSchema };
export type { FleetEventType };

export interface FleetEvent {
  id: string;
  workerId: string | null;
  jobId: string | null;
  event: FleetEventType;
  metadata: Readonly<Record<string, unknown>>;
  createdAt: Date;
}
