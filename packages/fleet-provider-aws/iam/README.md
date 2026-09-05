# VeoLMS Video Fleet IAM Policies & Setup

This directory contains the complete set of IAM policies and automation scripts for the VeoLMS video transcoding infrastructure across all lifecycle stages: initial infrastructure provisioning, runtime worker execution, and automated CI/CD deployment.

---

## Policy Inventory

| Policy File | Intended Target | Purpose | Scope |
|---|---|---|---|
| **`cicd-infra-deployer-policy.json`** | IAM User / GitHub Actions (`veolms-fleet-infra-action`) | Used by GitHub Actions to update Lambda function code and upload bundles to the S3 build bucket. | Least-privilege: S3 build bucket (`bundles/*`) & `veolms-*` Lambdas only. |
| **`infra-provisioner-policy.json`** | IAM User / Admin / Provisioning Role | Used by the engineer or pipeline running `pnpm fleet:infra` to create all resources from scratch. | Creates S3 buckets, IAM roles/instance profiles, Lambdas, CloudWatch log groups, and EventBridge schedules. |
| **`worker-runtime-trust-policy.json`** | Trust Relationship on `VeoLMSWorkerRole` | Allows AWS services to assume the worker runtime role. | Trusted Services: `ec2.amazonaws.com`, `lambda.amazonaws.com`, `scheduler.amazonaws.com`. |
| **`worker-runtime-policy.json`** | Permissions Policy attached to `VeoLMSWorkerRole` | Permissions used by EC2 transcode workers and Fleet Manager Lambdas during job processing. | Reads/writes video segments in S3, manages EC2 spot worker lifecycle, reports CloudWatch logs, and schedules wakeups. |

---

## 1. Infrastructure Provisioning Policy (`infra-provisioner-policy.json`)

If you want to create an IAM User or Role specifically to run the setup tool `pnpm fleet:infra`, attach [`infra-provisioner-policy.json`](./infra-provisioner-policy.json).

### Resources Managed:
- **S3**: Creates media storage and build buckets with CORS configurations and public-read policies.
- **IAM**: Creates `VeoLMSWorkerRole` and `VeoLMSWorkerInstanceProfile`.
- **Lambda**: Creates `veolms-fleet-manager` and `veolms-video-metadata-probe`.
- **CloudWatch Logs**: Creates log groups `/veolms/*` with retention policies.
- **EventBridge**: Creates scheduler execution roles and schedule groups.
- **EC2**: Creates security groups and key pairs.

---

## 2. Worker Runtime Role (`VeoLMSWorkerRole`)

The setup wizard automatically creates this role and its instance profile (`VeoLMSWorkerInstanceProfile`). If you wish to create it manually:

1. **Create the Role with the Trust Policy** ([`worker-runtime-trust-policy.json`](./worker-runtime-trust-policy.json)):
   ```bash
   aws iam create-role \
     --role-name VeoLMSWorkerRole \
     --assume-role-policy-document file://packages/fleet-provider-aws/iam/worker-runtime-trust-policy.json
   ```

2. **Attach AWS Managed Policies**:
   ```bash
   aws iam attach-role-policy --role-name VeoLMSWorkerRole --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy
   aws iam attach-role-policy --role-name VeoLMSWorkerRole --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
   aws iam attach-role-policy --role-name VeoLMSWorkerRole --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
   ```

3. **Attach Inline Permissions Policy** ([`worker-runtime-policy.json`](./worker-runtime-policy.json)):
   ```bash
   # Render variables (bucket names and region) and attach:
   aws iam put-role-policy \
     --role-name VeoLMSWorkerRole \
     --policy-name VeoLMSWorkerRuntimePolicy \
     --policy-document file://packages/fleet-provider-aws/iam/worker-runtime-policy.json
   ```

4. **Create the Instance Profile & Add Role**:
   ```bash
   aws iam create-instance-profile --instance-profile-name VeoLMSWorkerInstanceProfile
   aws iam add-role-to-instance-profile --instance-profile-name VeoLMSWorkerInstanceProfile --role-name VeoLMSWorkerRole
   ```

---

## 3. CI/CD Deployer User (`veolms-fleet-infra-action`)

Used exclusively by GitHub Actions to deploy code updates safely without broad administrative rights.

### Automated Provisioning Script:
Run either script from your terminal:

**Via pnpm**:
```bash
pnpm fleet:cicd
```

**Via Bash / AWS CLI**:
```bash
S3_BUILD_BUCKET="<your-s3-build-bucket>" AWS_REGION="<your-region>" ./packages/fleet-provider-aws/iam/setup-cicd-iam.sh
```

### GitHub Repository Secrets to Add:
In **Settings** ➔ **Secrets and variables** ➔ **Actions**:

| Name | Type | Value |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | Secret | Access Key from setup output |
| `AWS_SECRET_ACCESS_KEY` | Secret | Secret Key from setup output |
| `S3_BUILD_BUCKET` | Variable / Secret | Your S3 build bucket name |
| `AWS_REGION` | Variable *(optional)* | e.g. `ap-south-1` |
