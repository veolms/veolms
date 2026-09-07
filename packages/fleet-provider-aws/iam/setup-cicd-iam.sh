#!/usr/bin/env bash
set -Eeuo pipefail

USER_NAME="${CICD_USER_NAME:-veolms-fleet-infra-action}"
POLICY_NAME="${CICD_POLICY_NAME:-veolms-fleet-infra-action-policy}"
REGION="${AWS_REGION:-${FLEET_MANAGER_LAMBDA_REGION:-ap-south-1}}"

# Attempt to load S3_BUILD_BUCKET from apps/fleet-manager/.env if not in environment
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

if [ -z "${S3_BUILD_BUCKET:-}" ] && [ -f "${REPO_ROOT}/apps/fleet-manager/.env" ]; then
  S3_BUILD_BUCKET=$(grep -E "^(S3_BUILD_BUCKET|S3_BUCKET_NAME|S3_BUCKET)=" "${REPO_ROOT}/apps/fleet-manager/.env" | head -n 1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
fi

BUCKET_NAME="${S3_BUILD_BUCKET:-}"

if [ -z "${BUCKET_NAME}" ]; then
  echo "✘ Error: S3_BUILD_BUCKET is not set."
  echo "Usage: S3_BUILD_BUCKET=<bucket-name> AWS_REGION=<region> ./setup-cicd-iam.sh"
  exit 1
fi

echo "============================================================="
echo "  VeoLMS CI/CD Deployer IAM User Setup (AWS CLI)"
echo "============================================================="

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "  ✔ AWS Account ID: ${ACCOUNT_ID}"
echo "  ✔ AWS Region:     ${REGION}"
echo "  ✔ S3 Bucket:      ${BUCKET_NAME}"

# 1. Create User if not exists
if aws iam get-user --user-name "${USER_NAME}" >/dev/null 2>&1; then
  echo "✔ IAM User ${USER_NAME} exists."
else
  aws iam create-user --user-name "${USER_NAME}"
  echo "✔ Created IAM User ${USER_NAME}."
fi

# 2. Render Policy
TEMP_POLICY=$(mktemp)
sed -e "s|\${S3_BUILD_BUCKET}|${BUCKET_NAME}|g" \
    -e "s|\${AWS_REGION}|${REGION}|g" \
    -e "s|\${AWS_ACCOUNT_ID}|${ACCOUNT_ID}|g" \
    "${SCRIPT_DIR}/cicd-infra-deployer-policy.json" > "${TEMP_POLICY}"

POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"

# 3. Create or update Policy
if aws iam get-policy --policy-arn "${POLICY_ARN}" >/dev/null 2>&1; then
  echo "✔ Updating policy ${POLICY_NAME}..."
  OLD_VERSIONS=$(aws iam list-policy-versions --policy-arn "${POLICY_ARN}" \
    --query 'Versions[?!IsDefaultVersion].VersionId' --output text)
  for v in ${OLD_VERSIONS}; do
    aws iam delete-policy-version --policy-arn "${POLICY_ARN}" --version-id "$v" || true
  done
  aws iam create-policy-version \
    --policy-arn "${POLICY_ARN}" \
    --policy-document "file://${TEMP_POLICY}" \
    --set-as-default
else
  echo "✔ Creating policy ${POLICY_NAME}..."
  aws iam create-policy \
    --policy-name "${POLICY_NAME}" \
    --policy-document "file://${TEMP_POLICY}" \
    --description "Least-privilege CI/CD deployer policy for VeoLMS video fleet artifacts and Lambdas"
fi
rm -f "${TEMP_POLICY}"

# 4. Attach Policy to User
aws iam attach-user-policy \
  --user-name "${USER_NAME}" \
  --policy-arn "${POLICY_ARN}"
echo "✔ Attached policy to ${USER_NAME}."

# 5. Access Key
EXISTING_KEYS=$(aws iam list-access-keys --user-name "${USER_NAME}" --query 'AccessKeyMetadata[*].AccessKeyId' --output text 2>/dev/null || true)
if [ -n "${EXISTING_KEYS}" ]; then
  echo "✔ User already has access key(s): ${EXISTING_KEYS}"
fi

GENERATE_KEY="no"
if [ -t 0 ]; then
  read -rp "? Do you want to generate a new AWS Access Key for ${USER_NAME}? (y/N) " ASK_KEYS
  if [[ "${ASK_KEYS}" =~ ^[Yy] ]]; then
    GENERATE_KEY="yes"
  fi
elif [ -z "${EXISTING_KEYS}" ]; then
  GENERATE_KEY="yes"
fi

ACCESS_KEY_ID="${EXISTING_KEYS%% *}"
SECRET_ACCESS_KEY=""

if [ "${GENERATE_KEY}" = "yes" ]; then
  KEY_JSON=$(aws iam create-access-key --user-name "${USER_NAME}")
  ACCESS_KEY_ID=$(echo "${KEY_JSON}" | grep -o '"AccessKeyId": "[^"]*' | cut -d'"' -f4)
  SECRET_ACCESS_KEY=$(echo "${KEY_JSON}" | grep -o '"SecretAccessKey": "[^"]*' | cut -d'"' -f4)
  echo "✔ Created new access key for ${USER_NAME}."
else
  echo "ℹ Skipped generating new access keys."
fi

echo ""
echo "============================================================="
echo "  Configure these in GitHub Repository Secrets:"
echo "============================================================="
echo "  AWS_ACCESS_KEY_ID:     ${ACCESS_KEY_ID:-<not-generated>}"
if [ -n "${SECRET_ACCESS_KEY}" ]; then
  echo "  AWS_SECRET_ACCESS_KEY: ${SECRET_ACCESS_KEY}"
  echo "  (Save Secret Access Key now — it cannot be viewed again!)"
else
  echo "  AWS_SECRET_ACCESS_KEY: <existing-secret-key-or-not-generated>"
fi
echo "  AWS_REGION:            ${REGION}"
echo "  S3_BUILD_BUCKET:       ${BUCKET_NAME}"
echo "============================================================="
