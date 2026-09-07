# VeoLMS Video Fleet: End-to-End Infrastructure & CI/CD Setup Guide

This document provides a comprehensive, step-by-step walkthrough for setting up the VeoLMS video transcoding fleet from scratch: from initial cloud provider selection and AWS infrastructure provisioning to automated least-privilege IAM user creation and GitHub Actions CI/CD deployment.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Local["1. Developer / Host Environment"]
        A["Choose Provider<br/>(FLEET_PROVIDER=aws)"] --> B["Run Infra Setup<br/>(pnpm fleet:infra)"]
        B --> C["Run IAM CI/CD Setup<br/>(pnpm fleet:cicd)"]
        C --> D["Configure GitHub Secrets<br/>(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUILD_BUCKET)"]
    end

    subgraph AWS["2. AWS Cloud Infrastructure"]
        B -. Provisions .-> S3Storage["S3 Media Storage Bucket<br/>(Public Read + CORS)"]
        B -. Provisions .-> S3Build["S3 Build Bucket<br/>(bundles/media-worker.js, bundles/*.zip)"]
        B -. Provisions .-> IAMRole["IAM Role & Profile<br/>(VeoLMSWorkerRole)"]
        B -. Provisions .-> Lambdas["AWS Lambdas<br/>(veolms-fleet-manager, veolms-video-metadata-probe)"]
        B -. Provisions .-> CW["CloudWatch Log Groups & EventBridge"]
    end

    subgraph GitHubActions["3. GitHub Actions CI/CD (.github/workflows/deploy-video-fleet-infra.yml)"]
        Push["Push to 'development' (or workflow_dispatch)"]
        Push --> Filter{"Path Filter Match?<br/>(apps/fleet-manager, apps/media-worker, packages/fleet-*)`"}
        Filter -- No --> Skip["Skip run (No redundant triggers)"]
        Filter -- Yes --> TestGate["Test & Quality Gate<br/>(130 unit tests + typechecks)"]
        TestGate -- Fail --> Abort["Abort Deployment Immediately"]
        TestGate -- Pass --> Detect{"Detect Changes"}
        Detect -- Worker Changed --> UploadWorker["Build & Upload Worker<br/>s3://build-bucket/bundles/media-worker.js"]
        Detect -- Lambda Changed --> UpdateLambda["Build & Upload Lambda Zips<br/>Call aws lambda update-function-code"]
    end
```

---

## Step 1: Select Cloud Provider

VeoLMS features a pluggable provider architecture supporting both `aws` (production cloud fleet) and `local` (Docker / LocalStack development).

Run the provider selection tool from the workspace root:

```bash
pnpm fleet:provider
```

Choose **`AWS (Amazon Web Services)`**. This configures `FLEET_PROVIDER=aws` across your environment.

---

## Step 2: Provision Main AWS Infrastructure

Run the infrastructure setup CLI:

```bash
pnpm fleet:infra
```

The interactive wizard guides you through provisioning and verifying all necessary AWS resources:

### What the Setup Wizard Provisions:

1. **S3 Media Storage Bucket**:
   - Stores input raw videos and output HLS rendition folders (`courses/{courseId}/hls/master.m3u8`, `.ts` segments).
   - Configures public read policy (`s3:GetObject`).
   - Automatically attaches an **S3 CORS Configuration** (`GET`, `HEAD`, `AllowedOrigins: *`) so web browsers and players can stream playlists without cross-origin errors.
2. **S3 Build Bucket**:
   - Private bucket storing standalone execution bundles:
     - `bundles/media-worker.js` (downloaded by EC2 instances during boot)
     - `bundles/fleet-manager.zip` (Lambda deployment package)
     - `bundles/probe-lambda.zip` (Metadata probe Lambda deployment package)
3. **IAM Worker Role & Instance Profile (`VeoLMSWorkerRole`)**:
   - Scoped IAM role assumed by EC2 transcode workers and Lambda functions.
   - Allows reading/writing video jobs in S3 and reporting heartbeats/events.
4. **CloudWatch Log Groups**:
   - `/veolms/workers`: EC2 transcode and UserData bootstrap logs.
   - `/veolms/fleet-manager`: Fleet manager daemon logs.
   - `/aws/lambda/veolms-video-metadata-probe`: Probe Lambda logs.
5. **Serverless Lambda Functions**:
   - `veolms-fleet-manager`: Serverless coordinator managing job queue and EC2 scaling.
   - `veolms-video-metadata-probe`: Pre-probes video metadata (resolution, frame rate, codec) using `ffprobe` directly over S3 presigned URLs.
6. **Initial Artifact Upload**:
   - Automatically bundles `apps/media-worker` and serverless entrypoints and uploads them to the S3 build bucket.
### IAM Policies Reference for Infrastructure & Runtime

All policy definitions live in [`packages/fleet-provider-aws/iam/`](../packages/fleet-provider-aws/iam/):

1. **Infrastructure Provisioning Policy** ([`infra-provisioner-policy.json`](../packages/fleet-provider-aws/iam/infra-provisioner-policy.json)):
   - Used by any engineer, admin, or script executing `pnpm fleet:infra`.
   - Grants permissions to create S3 buckets, IAM roles/instance profiles, Lambda functions, CloudWatch log groups, and EventBridge schedules.
2. **Worker Runtime Role Policy** ([`worker-runtime-policy.json`](../packages/fleet-provider-aws/iam/worker-runtime-policy.json)) & Trust Policy ([`worker-runtime-trust-policy.json`](../packages/fleet-provider-aws/iam/worker-runtime-trust-policy.json)):
   - Attached to `VeoLMSWorkerRole` and assumed by EC2 transcode instances, Fleet Manager Lambdas, and EventBridge Scheduler.
   - Allows reading raw video and writing HLS segments to S3, provisioning EC2 spot instances, reporting CloudWatch logs, and scheduling wakeups.

---

## Step 3: Create Dedicated CI/CD IAM User & Policy

To automate updates securely without exposing root or administrative AWS credentials in GitHub, create a dedicated least-privilege IAM user for GitHub Actions.

### Automated Setup Command

Run the setup script located in [`packages/fleet-provider-aws/iam/`](../packages/fleet-provider-aws/iam/):

#### Option A: Via pnpm (Recommended)
```bash
pnpm fleet:cicd
```

#### Option B: Via Bash / AWS CLI
```bash
S3_BUILD_BUCKET="<your-build-bucket>" AWS_REGION="<your-region>" ./packages/fleet-provider-aws/iam/setup-cicd-iam.sh
```

### What This Script Does:
1. Queries your current AWS Account ID dynamically via `aws sts get-caller-identity`.
2. Creates an IAM User named **`veolms-fleet-infra-action`**.
3. Creates and attaches the least-privilege policy **`veolms-fleet-infra-action-policy`** defined in [`packages/fleet-provider-aws/iam/cicd-infra-deployer-policy.json`](../packages/fleet-provider-aws/iam/cicd-infra-deployer-policy.json).
4. Generates or preserves an Access Key pair and outputs the exact values to paste into GitHub.

### Permissions Granted by the CI/CD Policy:
- **S3 Build Bucket**: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:DeleteObjectVersion`, `s3:HeadObject`, `s3:ListBucket` strictly scoped to `arn:aws:s3:::${S3_BUILD_BUCKET}/*`.
- **AWS Lambda**: `lambda:UpdateFunctionCode`, `lambda:GetFunction`, `lambda:GetFunctionConfiguration`, `lambda:PublishVersion` on `veolms-fleet-manager` and `veolms-video-metadata-probe`.
- **CloudWatch Logs**: `logs:DescribeLogGroups`.
- **Zero Wildcard Admin**: Cannot modify billing, IAM, VPC, or other AWS services.

---

## Step 4: Configure GitHub Repository Secrets & Variables

In your GitHub repository, navigate to:
**Settings** ➔ **Secrets and variables** ➔ **Actions**

### 1. Repository Secrets (Click "New repository secret")

| Secret Name | Required | Description | Example |
|---|---|---|---|
| `AWS_ACCESS_KEY_ID` | **Yes** | Access Key ID for `veolms-fleet-infra-action` | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | **Yes** | Secret Access Key for `veolms-fleet-infra-action` | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |

### 2. Repository Variables (Click "New repository variable")

| Variable Name | Required | Description | Example |
|---|---|---|---|
| `S3_BUILD_BUCKET` | **Yes** | S3 bucket where worker and Lambda bundles reside | `my-media-build-bucket` |
| `AWS_REGION` | Optional | AWS Region (defaults to `ap-south-1` if omitted) | `ap-south-1` |
| `FLEET_MANAGER_LAMBDA_NAME` | Optional | Lambda function name for fleet manager | `veolms-fleet-manager` |
| `PROBE_LAMBDA_NAME` | Optional | Lambda function name for metadata probe | `veolms-video-metadata-probe` |

---

## Step 5: How the CI/CD Workflow Operates

The workflow file is located at [`.github/workflows/deploy-video-fleet-infra.yml`](../.github/workflows/deploy-video-fleet-infra.yml).

### 1. Trigger Conditions:
- **Branch**: Push to `development`.
- **Path Filtering**: To avoid wasting CI runner minutes, it triggers **only** when files in the following paths are changed:
  - `apps/fleet-manager/**`
  - `apps/media-worker/**`
  - `packages/fleet-provider-aws/**`
  - `packages/fleet-types/**`
  - `packages/config/**`
  - `packages/database/**`
  - `.github/workflows/deploy-video-fleet-infra.yml`
- **Manual Trigger**: Can be dispatched on-demand via the GitHub Actions UI (`workflow_dispatch`) with checkboxes to selectively deploy worker, lambdas, or both.

### 2. Job 1: Test & Quality Gate (`test-video-pipeline`)
Before any code is built or deployed, the workflow runs a complete automated test suite:
- Runs TypeScript type-checks across all monorepo packages.
- Runs **130 unit tests**:
  - `@veolms/media-worker` (44 tests)
  - `@veolms/fleet-manager` (44 tests)
  - `@veolms/fleet-provider-aws` (42 tests)
- **If any test fails, deployment stops immediately.**

### 3. Job 2: Targeted Build & Deploy (`deploy-video-fleet`)
Once tests pass, the deploy job detects which components actually changed in git:
- **When Media Worker Changes**:
  - Builds `apps/media-worker` into a single standalone bundle (`bundles/media-worker.js`).
  - Uploads the bundle to `s3://${S3_BUILD_BUCKET}/bundles/media-worker.js`.
  - Next time an EC2 instance launches, it automatically pulls the latest bundle.
- **When Lambda Changes**:
  - Builds the serverless coordinator and probe Lambda packages (`bundles/fleet-manager.zip`, `bundles/probe-lambda.zip`).
  - Uploads the zip files to the S3 build bucket.
  - Executes `aws lambda update-function-code` for `veolms-fleet-manager` and `veolms-video-metadata-probe`.
  - Waits for AWS Lambda to finish applying the code update (`aws lambda wait function-updated`).

---

## Step 6: Day-to-Day Development & Updates Workflow

### Updating Transcoding Logic or Worker Behavior:
1. Make changes in `apps/media-worker/`.
2. Commit and push to `development`:
   ```bash
   git add apps/media-worker/
   git commit -m "feat(media-worker): optimize audio bitrate handling"
   git push origin development
   ```
3. GitHub Actions triggers, runs all tests, and updates `s3://${S3_BUILD_BUCKET}/bundles/media-worker.js`.
4. Existing running instances continue their jobs; any newly spawned worker immediately runs the updated code.

### Updating Lambda Coordinator or Scheduler Logic:
1. Make changes in `apps/fleet-manager/src/entrypoints/serverless.ts` or `packages/fleet-provider-aws/`.
2. Commit and push to `development`.
3. GitHub Actions runs tests, uploads the new zip files, and updates the live AWS Lambda functions.

### Manual Verification Command:
You can also build and upload artifacts manually from your terminal at any time:
```bash
# Upload only worker bundle
pnpm fleet:build:upload --only-worker

# Upload only lambda packages and update AWS Lambda functions
pnpm fleet:build:upload --only-lambda --update-lambda

# Upload and update everything
pnpm fleet:build:upload --update-lambda
```
