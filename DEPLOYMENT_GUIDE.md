# Chronas CDK Deployment Guide

## AWS Configuration

- **AWS Profile**: `chronas-dev`
- **AWS Region**: `eu-west-1` (Ireland)
- **AWS Account**: 704516356990

## Prerequisites

1. **AWS CLI Configuration**
   ```bash
   aws configure --profile chronas-dev
   # Enter your AWS credentials for the chronas-dev environment
   ```

2. **Verify AWS Access**
   ```bash
   aws sts get-caller-identity --profile chronas-dev
   ```

3. **CDK Bootstrap** (First time only)
   ```bash
   export AWS_PROFILE=chronas-dev
   export AWS_DEFAULT_REGION=eu-west-1
   npx cdk bootstrap --profile chronas-dev
   ```

## Deployment Commands

### Build and Deploy All Stacks
```bash
export AWS_PROFILE=chronas-dev
export AWS_DEFAULT_REGION=eu-west-1
npm run build
npx cdk deploy --all --profile chronas-dev
```

### Deploy Lambda Stack Only
```bash
export AWS_PROFILE=chronas-dev
export AWS_DEFAULT_REGION=eu-west-1
npm run build
npx cdk deploy ChronasApiLambdaStack --profile chronas-dev
```

### Synthesize Templates (Dry Run)
```bash
export AWS_PROFILE=chronas-dev
export AWS_DEFAULT_REGION=eu-west-1
npm run build
npx cdk synth --profile chronas-dev
```

## Lambda Configuration

### Runtime Details
- **Runtime**: Node.js 22.x (latest available in CDK 2.215.0)
- **Memory**: 1024MB (optimized for performance)
- **Timeout**: 30 seconds (cost-optimized)
- **Architecture**: x86_64
- **Handler**: `lambda-handler.handler`

> **✅ Perfect Match**: The application is developed for Node.js 22.x and now deploys with the native Node.js 22.x Lambda runtime!

### Environment Variables
- `VPC_ID`: VPC identifier for networking
- `SECRET_DB_NAME`: DocumentDB credentials secret name
- `SECRET_CONFIG_NAME`: Application configuration secret name
- `DEBUG`: Debug logging configuration
- `NODE_ENV`: Set to 'production'
- `PORT`: Application port (8080)
- `CHRONAS_HOST`: Application host URL
- OAuth callback URLs for authentication providers

### IAM Permissions
- **Secrets Manager**: GetSecretValue, DescribeSecret
- **VPC**: Network interface management
- **X-Ray**: Tracing capabilities
- **CloudWatch**: Logging and metrics

## Monitoring

### CloudWatch Alarms
- **Lambda Errors**: Threshold 5 errors in 2 evaluation periods
- **Lambda Duration**: Threshold 25 seconds in 3 evaluation periods

### CloudWatch Dashboards
- Lambda invocations and errors
- Performance metrics (duration, cold starts)
- Concurrent executions
- Throttling metrics

## Bundle Optimization

### Excluded Files
- Development files (`.git`, `*.md`, `tests/`, `docs/`)
- Test files (`*.test.js`, `*.spec.js`)
- Coverage reports and build artifacts
- Environment files (`.env*`)

### Performance Optimizations
- Connection caching for database
- Cold start optimization
- Source maps enabled for debugging
- Reserved concurrent executions: 10
- Dead letter queue enabled
- Retry attempts: 2

## Troubleshooting

### Common Issues

1. **Docker Not Available**
   - Current configuration uses simple asset bundling without Docker
   - For advanced bundling, ensure Docker is installed and running

2. **AWS Credentials**
   ```bash
   aws configure list-profiles
   aws sts get-caller-identity --profile chronas-dev
   ```

3. **CDK Bootstrap Required**
   ```bash
   npx cdk bootstrap --profile chronas-dev
   ```

4. **Node.js Version Warning**
   - CDK shows warnings for Node.js 24.x
   - This is non-critical and doesn't affect deployment
   - Can be silenced with: `export JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1`

### Verification Script
Run the deployment verification script:
```bash
node scripts/verify-deployment.js
```

## Next Steps

1. **Bootstrap CDK** (if not done)
2. **Deploy Infrastructure Stacks** (VPC, Secrets, etc.)
3. **Deploy Lambda Stack**
4. **Test API Endpoints**
5. **Monitor Performance**

## Security Notes

- All secrets are managed via AWS Secrets Manager
- VPC deployment for network isolation
- IAM roles follow least privilege principle
- TLS encryption for DocumentDB connections
- X-Ray tracing enabled for observability