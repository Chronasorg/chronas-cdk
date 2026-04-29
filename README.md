# Chronas CDK

> ## ⚠️ DO NOT RUN `cdk deploy`
>
> This CDK repo has **known drift** from deployed AWS resources. A naive `cdk deploy` could damage production.
>
> **Current state (April 2026):**
> - DocumentDB has been **deleted** (migrated to DynamoDB)
> - Lambda is **no longer in a VPC**
> - VPC endpoints have been **deleted**
> - DynamoDB tables were created via CLI (not CDK)
>
> Infrastructure changes are made via **AWS CLI**. Do not run `cdk deploy` or `cdk destroy`.

## What CDK still manages

| Stack | Status | Resources |
|-------|--------|-----------|
| `ChronasApiLambdaStackV2` | Active | Lambda function, IAM role, SQS DLQ, CloudWatch alarms |
| `ChronasFrontendS3Stack` | Active | S3 bucket, CloudFront distribution, cache policies |
| `ChronasApiLambdaStack` (V1) | Orphaned | Old Lambda (unused, safe to delete via CloudFormation console) |
| `BuildChronasAPi` | Orphaned | CodeBuild + ECR (disabled, safe to delete) |

## Current Production Architecture

- **API**: Lambda (Node.js 22) → DynamoDB (10 tables, `chronas-*`)
- **Frontend**: S3 (`chronas-frontend-new`) → CloudFront → `chronas.org`
- **Deployment**: GitHub Actions (not CDK)
- **Cost**: ~$8-10/mo

## If you need to change infrastructure

1. Make the change via `aws` CLI with `--profile chronas-prod`
2. Document the change in the relevant repo's CLAUDE.md
3. Do NOT attempt to reconcile CDK with the current state unless doing a dedicated session
