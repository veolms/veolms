#!/bin/sh
set -eu

endpoint="${AWS_ENDPOINT_URL:-http://localstack:4566}"
aws_local() {
  aws --endpoint-url "$endpoint" "$@"
}

for attempt in $(seq 1 60); do
  if aws_local sts get-caller-identity >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" = "60" ]; then
    echo "LocalStack did not become ready" >&2
    exit 1
  fi
  sleep 1
done

aws_local iam create-role \
  --role-name VeoLMSLocalStackRole \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":["lambda.amazonaws.com","ec2.amazonaws.com"]},"Action":"sts:AssumeRole"}]}' \
  >/dev/null 2>&1 || true

zip_file=/workspace/apps/fleet-manager/dist/lambda/function.zip
if [ ! -f "$zip_file" ]; then
  echo "Missing $zip_file. Run: pnpm build:serverless" >&2
  exit 1
fi

if [ "${LOCALSTACK_EC2_ENABLED:-false}" = "true" ]; then
  # LocalStack Pro/Ultimate EC2 Docker emulation: Lambda -> EC2 API -> worker.
  environment="Variables={DATABASE_URL=${DATABASE_URL},PROVIDER=aws,FLEET_PROVIDER=aws,STORAGE_PROVIDER=local,LOCAL_STORAGE_ROOT=/app/s3-bucket,WORKER_MAX_JOBS=1,FLEET_TEST_MODE=true,AMI_ID=ami-0a11ce001,EC2_VM_MANAGER=docker,AWS_ACCESS_KEY_ID=test,AWS_SECRET_ACCESS_KEY=test,AWS_REGION=us-east-1}"
  mode="EC2 Docker emulation"
else
  # Community-compatible fallback: Lambda talks to the mounted Docker Engine
  # socket directly. This keeps Lambda orchestration and one worker per job
  # without requiring LocalStack's EC2 emulation feature.
  environment="Variables={DATABASE_URL=${DATABASE_URL},PROVIDER=docker,FLEET_PROVIDER=docker,STORAGE_PROVIDER=local,LOCAL_STORAGE_ROOT=/app/s3-bucket,WORKER_MAX_JOBS=1,FLEET_TEST_MODE=true,DOCKER_TRANSPORT=socket,DOCKER_SOCKET_PATH=/var/run/docker.sock,DOCKER_WORKER_IMAGE=veolms-media-worker:local,DOCKER_NETWORK=${DOCKER_NETWORK:-veolms-fleet},DOCKER_STORAGE_ROOT=${DOCKER_STORAGE_ROOT},DOCKER_VERIFICATION_STORAGE_ROOT=/app/s3-bucket}"
  mode="Docker socket fallback (no LocalStack EC2 required)"
fi
role="arn:aws:iam::000000000000:role/VeoLMSLocalStackRole"

if aws_local lambda get-function --function-name veolms-fleet-manager >/dev/null 2>&1; then
  aws_local lambda update-function-code \
    --function-name veolms-fleet-manager \
    --zip-file "fileb://${zip_file}" >/dev/null
  aws_local lambda update-function-configuration \
    --function-name veolms-fleet-manager \
    --environment "$environment" >/dev/null
else
  aws_local lambda create-function \
    --function-name veolms-fleet-manager \
    --runtime nodejs22.x \
    --handler index.handler \
    --role "$role" \
    --timeout 60 \
    --memory-size 1024 \
    --environment "$environment" \
    --zip-file "fileb://${zip_file}" >/dev/null
fi

echo "LocalStack Fleet Manager Lambda is ready (${mode})."
