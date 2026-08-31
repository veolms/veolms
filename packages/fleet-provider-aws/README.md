# VeoLMS AWS Fleet Provider (`@veolms/fleet-provider-aws`)

AWS infrastructure provider for the VeoLMS transcoding pipeline. Manages ephemeral **EC2 Spot/On-Demand Graviton arm64 and x86_64 instances**, **AWS EventBridge Scheduler dynamic triggers**, **S3 bundle and output verification**, and automated setup CLI tooling.

---

## Features

- **EC2 Spot & On-Demand Lifecycle**: Launches Graviton (`c7g.*`, `t4g.*`) or Intel/AMD (`c6i.*`, `t3.*`) workers tailored to the computed video job hardware requirements.
- **Dynamic Debian 13 AMI Resolution**: Resolves latest Debian point-release AMIs via AWS public SSM parameters (`/aws/service/debian/release/13/latest/${arch}`) with a 6-hour TTL cache.
- **Pre-baked AMI Builder**: Interactive builder (`pnpm fleet:ami`) creates custom AMIs with Node.js 24, FFmpeg, and AWS CLI pre-installed for **<30s boot times**.
- **Trap-Protected UserData Bootstrapper**: Slices environment variables securely into `/opt/veolms/worker.env`, downloads the bundled media-worker from S3, and executes with a trap that automatically uploads logs to S3 and terminates the EC2 instance on any failure or exit.
- **AWS EventBridge Scheduler Dynamic Triggers**: Creates one-shot `at(timestamp)` schedules targeting the Fleet Manager Lambda via `@aws-sdk/client-scheduler`, deleting them automatically when no active workers remain.
- **Two-Way Cluster Discovery**: Lists and maps real EC2 instance states with tag filters (`tag:ManagedBy=veolms-fleet-manager`) for cluster reconciliation.
- **S3 Output Verification**: Verifies `master.m3u8` playlists and segment uploads in S3 before marking jobs complete.
- **LocalStack Compatible**: Automatically detects LocalStack endpoints (`AWS_ENDPOINT_URL`) and falls back safely during local offline testing.

---

## File Structure

```
packages/fleet-provider-aws/
├── src/
│   ├── bootstrapper.ts        # UserData script template generator & Base64 encoder
│   ├── bootstrap-script.sh    # Bash bootstrap script executed on EC2 boot
│   ├── config.ts              # Zod environment & AWS configuration loader
│   ├── debian-ami.ts          # Public Debian SSM AMI ID resolver with caching
│   ├── index.ts               # Package public exports
│   ├── instance-types.ts      # arm64 & x86_64 EC2 profile matching table
│   ├── lambda.ts              # AWS Lambda entrypoint adapter
│   ├── provider.ts            # FleetProvider implementation (EC2, SSM, S3, Scheduler)
│   ├── scheduler.ts           # EventBridge Scheduler client & one-shot triggers
│   └── setup/
│       ├── aws-cli-check.ts   # AWS CLI / STS credential validator
│       ├── build-ami.ts       # Pre-baked worker AMI builder
│       ├── destroy.ts         # Infrastructure teardown script
│       └── index.ts           # Interactive infrastructure setup CLI
└── tests/
    ├── aws-provider.test.ts   # Provider & instance mapping tests
    ├── bootstrapper.test.ts   # UserData & trap tests
    ├── instance-types.test.ts # Instance profile selector tests
    ├── scheduler.test.ts      # EventBridge Scheduler tests
    └── setup-actions.test.ts  # Setup export verification tests
```

---

## Configuration Variables

| Variable                                        | Description                                                      | Default                       |
| :---------------------------------------------- | :--------------------------------------------------------------- | :---------------------------- |
| `AWS_REGION`                                    | AWS region for EC2, S3, SSM, and EventBridge Scheduler           | `us-east-1`                   |
| `EC2_USE_SPOT`                                  | Whether to launch workers as EC2 Spot instances (`true`/`false`) | `true`                        |
| `EC2_IAM_INSTANCE_PROFILE`                      | IAM instance profile attached to worker instances                | `VeoLMSWorkerInstanceProfile` |
| `S3_BUCKET` / `S3_BUCKET_NAME`                  | S3 bucket containing worker bundles and video outputs            | _Required_                    |
| `AMI_ID`                                        | Optional pre-baked AMI ID (bypasses dynamic Debian SSM lookup)   | _Optional_                    |
| `SUBNET_ID`                                     | Optional target subnet ID for EC2 launches                       | _Optional_                    |
| `SECURITY_GROUP_IDS` / `EC2_SECURITY_GROUP_IDS` | Comma-separated list of Security Group IDs                       | _Optional_                    |
| `KEY_NAME` / `EC2_KEY_NAME`                     | Optional EC2 KeyPair name for SSH debugging                      | _Optional_                    |
| `LAMBDA_FUNCTION_ARN`                           | ARN of the Fleet Manager Lambda (used by EventBridge Scheduler)  | _Optional_                    |
| `SCHEDULER_ROLE_ARN`                            | IAM Role ARN allowing EventBridge Scheduler to invoke Lambda     | _Optional_                    |

---

## Infrastructure Provisioning & Teardown

```bash
# Interactive setup: provisions IAM roles, profiles, S3 bucket permissions, log groups, and builds bundles
pnpm --filter @veolms/fleet-manager infra --provider=aws

# Build custom pre-baked AMI for instant boot times
pnpm --filter @veolms/fleet-provider-aws build:ami

# Teardown: safely terminates instances, deletes Lambda, log groups, and IAM roles
pnpm --filter @veolms/fleet-manager destroy --provider=aws
```

---

## Running Tests

```bash
pnpm --filter @veolms/fleet-provider-aws test
pnpm --filter @veolms/fleet-provider-aws typecheck
```
