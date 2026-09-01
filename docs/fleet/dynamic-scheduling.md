# Dynamic Wakeup Scheduling

In serverless execution mode, keeping a Lambda function running continuously while an EC2 worker transcodes video wastes compute costs. Instead, the Fleet Manager uses **adaptive dynamic scheduling** via Amazon EventBridge Scheduler to schedule one-shot wakeups.

---

## How Dynamic Scheduling Works

1. **Job Queued & Worker Launched**: When a job is claimed and a worker is launched, the Fleet Manager calculates an estimated duration based on video metadata and requested resolutions.
2. **Initial Check Scheduled**: The scheduler computes the first check time (typically halfway through the expected duration) and creates a one-shot EventBridge schedule targeting the Fleet Manager Lambda.
3. **Lambda Terminates (Scale-to-Zero)**: The Lambda handler exits cleanly. Zero serverless compute runs while the worker transcodes.
4. **Adaptive Wakeup & Re-evaluation**:
   - When the scheduled wakeup fires (`action: "tick"`), the Lambda wakes up, executes a monitoring cycle (`runMonitoringCycle`), checks worker progress, and reclaims completed/failed jobs.
   - If work is still in progress, it computes the _remaining estimated duration_ and schedules the next wakeup.
   - As progress reaches $\ge 90\%$, check intervals decrease adaptively to clamp near the minimum check interval (e.g. 15s - 30s) so job completion is caught with minimal latency.
5. **Queue Drained & Schedule Cleared**: Once all active workers finish and no queued jobs remain, the EventBridge schedule is deleted via `cancelWakeup()`, allowing the fleet to scale completely to zero.

---

## Scheduling Formula

```text
                                        Job Start
                                            │
                                            ▼
                    Initial Check = Estimated Duration / 2
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Dynamic Interval Calculation                    │
│                                                                        │
│   Remaining Sec = Estimated Duration × (1 - Progress% / 100)           │
│   Next Interval = max(MIN_INTERVAL_SEC, Remaining Sec / 2)             │
│                                                                        │
│   Example: 600s total duration                                         │
│     - At 0% progress:  check in 300s                                   │
│     - At 50% progress: check in 150s                                   │
│     - At 80% progress: check in 60s                                    │
│     - At 95% progress: check in 15s (clamped to MIN_INTERVAL_SEC)      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Amazon EventBridge Scheduler Integration

The `@veolms/fleet-provider-aws` package implements `scheduleNextWakeup` and `cancelWakeup` using `@aws-sdk/client-scheduler`:

- **One-shot Expression**: Formats timestamps into `at(yyyy-MM-ddTHH:mm:ss)` expressions (UTC).
- **Flexible Time Window**: Configured with `{ Mode: "OFF" }` for precise execution.
- **Payload Forwarding**: Passes `{ "action": "tick" }` in the schedule input payload.
- **Idempotency**: Updates existing schedules automatically on conflicts (`ConflictException`).
