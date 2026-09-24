VEOLMS API PERFORMANCE BASELINE

Purpose:
  Run a simple, repeatable baseline of the documented backend API.

Scope:
  Included: API, database-backed endpoints, response time, errors, response size.
  Excluded: video processing, video streaming, Fleet Manager.

Current test levels:
  Development: 5 and 10 active users.
  Production planning: maximum 300 active users, to be run only against a production-like environment.

Important:
  These tests are read-only smoke/load tests for GET endpoints.
  POST, PUT, PATCH, and DELETE endpoints are inventoried but not called automatically,
  because calling them can create, modify, or delete real data.

Run from the repository root:

  node performance/scripts/run-api-baseline.mjs

Git Bash command:

  BASE_URL=http://127.0.0.1:4000 USER_LEVELS=5,10 DURATION_SECONDS=15 node performance/scripts/run-api-baseline.mjs

For a production-like environment only, the same runner can be configured for
up to 300 active users. Do not run 300 users against a shared development API:

  BASE_URL=https://your-test-api.example.com USER_LEVELS=50,100,300 DURATION_SECONDS=60 node performance/scripts/run-api-baseline.mjs

Output:
  performance/reports/API_SUMMARY.txt
  performance/reports/modules/*.txt
  performance/raw/*.json

Simple interpretation:
  p95 = 95% of requests were faster than this value.
  p99 = slowest 1% tail.
  5xx/timeout = real backend failure.
  401/403 = normally expected for protected endpoints when testing without login.

Targets used in this baseline:
  p95 under 300 ms: good for a normal API endpoint.
  p95 300-1000 ms: review.
  p95 over 1000 ms: problem.
  5xx or timeout: problem.

N+1 and index status:
  Swagger response timing alone cannot prove N+1 or missing indexes.
  Those are marked as "needs SQL check" until query count and EXPLAIN are captured.
