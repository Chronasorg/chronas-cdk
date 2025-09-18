#!/bin/bash

# Deploy DocumentDB Migration Cluster Script
# This script deploys the new modernized DocumentDB cluster for migration

set -e

# Configuration
ENVIRONMENT=${1:-dev}
AWS_PROFILE="chronas-dev"
AWS_REGION="eu-west-1"
CDK_APP="deploy-migration-cluster.ts"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}Deploying DocumentDB Migration Cluster${NC}"
echo "Environment: $ENVIRONMENT"
echo "AWS Profile: $AWS_PROFILE"
echo "AWS Region: $AWS_REGION"
echo "----------------------------------------"

# Function to log messages
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

# Validate environment parameter
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    error "Invalid environment. Must be one of: dev, staging, prod"
fi

# Check prerequisites
log "Checking prerequisites..."

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    error "AWS CLI is not installed"
fi

# Check CDK CLI
if ! command -v cdk &> /dev/null; then
    error "AWS CDK CLI is not installed"
fi

# Check Node.js and npm
if ! command -v node &> /dev/null; then
    error "Node.js is not installed"
fi

if ! command -v npm &> /dev/null; then
    error "npm is not installed"
fi

# Check AWS credentials
log "Checking AWS credentials..."
if ! aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" > /dev/null 2>&1; then
    error "AWS CLI not configured properly or profile '$AWS_PROFILE' not found"
fi

# Get account ID
ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" --query 'Account' --output text)
log "AWS Account ID: $ACCOUNT_ID"

# Install dependencies
log "Installing CDK dependencies..."
npm install

# Build TypeScript
log "Building TypeScript..."
npm run build

# Bootstrap CDK if needed
log "Checking CDK bootstrap status..."
if ! aws cloudformation describe-stacks \
    --stack-name "CDKToolkit" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" > /dev/null 2>&1; then
    
    warn "CDK not bootstrapped for this account/region"
    log "Bootstrapping CDK..."
    
    cdk bootstrap \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        aws://$ACCOUNT_ID/$AWS_REGION
else
    info "CDK already bootstrapped"
fi

# Set environment variables for CDK
export AWS_PROFILE="$AWS_PROFILE"
export AWS_DEFAULT_REGION="$AWS_REGION"
export CDK_DEFAULT_ACCOUNT="$ACCOUNT_ID"
export CDK_DEFAULT_REGION="$AWS_REGION"

# Synthesize the stack first to check for errors
log "Synthesizing CDK stack..."
cdk synth \
    --app "npx ts-node $CDK_APP" \
    --context environment="$ENVIRONMENT" \
    --context account="$ACCOUNT_ID" \
    --context region="$AWS_REGION" \
    --profile "$AWS_PROFILE"

# Show what will be deployed
log "Showing deployment diff..."
cdk diff \
    --app "npx ts-node $CDK_APP" \
    --context environment="$ENVIRONMENT" \
    --context account="$ACCOUNT_ID" \
    --context region="$AWS_REGION" \
    --profile "$AWS_PROFILE" || true

# Confirm deployment
echo -e "${YELLOW}Ready to deploy the following stacks:${NC}"
echo "- ChronasNetwork-$ENVIRONMENT (if not exists)"
echo "- ChronasCloudwatch-$ENVIRONMENT (if not exists)"
echo "- ChronasDBMigration-$ENVIRONMENT"
echo ""
echo -e "${YELLOW}This will create:${NC}"
echo "- New DocumentDB 5.0 cluster with TLS enabled"
echo "- Optimized parameter group for Lambda workloads"
echo "- CloudWatch monitoring and alarms"
echo "- New secrets in AWS Secrets Manager"
echo ""

read -p "Do you want to proceed with the deployment? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

# Deploy the stacks
log "Deploying CDK stacks..."
cdk deploy \
    --app "npx ts-node $CDK_APP" \
    --context environment="$ENVIRONMENT" \
    --context account="$ACCOUNT_ID" \
    --context region="$AWS_REGION" \
    --profile "$AWS_PROFILE" \
    --require-approval never \
    --all

# Get deployment outputs
log "Retrieving deployment outputs..."

CLUSTER_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name "ChronasDBMigration-$ENVIRONMENT" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`DocumentDBClusterEndpoint`].OutputValue' \
    --output text 2>/dev/null || echo "Not available")

SECRET_ARN=$(aws cloudformation describe-stacks \
    --stack-name "ChronasDBMigration-$ENVIRONMENT" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`DocumentDBSecretArn`].OutputValue' \
    --output text 2>/dev/null || echo "Not available")

CLUSTER_ID=$(aws cloudformation describe-stacks \
    --stack-name "ChronasDBMigration-$ENVIRONMENT" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`DocumentDBClusterIdentifier`].OutputValue' \
    --output text 2>/dev/null || echo "Not available")

# Create deployment summary
DEPLOYMENT_SUMMARY="deployment-summary-$ENVIRONMENT-$(date +%Y%m%d_%H%M%S).md"

cat > "$DEPLOYMENT_SUMMARY" << EOF
# DocumentDB Migration Cluster Deployment Summary

**Deployment Date**: $(date)
**Environment**: $ENVIRONMENT
**AWS Account**: $ACCOUNT_ID
**AWS Region**: $AWS_REGION

## Deployed Resources

### DocumentDB Cluster
- **Cluster Endpoint**: $CLUSTER_ENDPOINT
- **Cluster Identifier**: $CLUSTER_ID
- **Engine Version**: 5.0.0 (MongoDB 5.0 compatible)
- **TLS**: Enabled
- **Backup Retention**: $([ "$ENVIRONMENT" = "prod" ] && echo "30 days" || echo "7 days")
- **Multi-AZ**: $([ "$ENVIRONMENT" = "prod" ] && echo "Yes (3 instances)" || echo "No (1 instance)")

### Security
- **Secret ARN**: $SECRET_ARN
- **Secret Name**: /chronas/$ENVIRONMENT/docdb/modernized
- **Encryption**: Enabled
- **Deletion Protection**: $([ "$ENVIRONMENT" = "prod" ] && echo "Enabled" || echo "Disabled")

### Monitoring
- **CloudWatch Logs**: Enabled (audit, profiler)
- **Performance Insights**: Enabled
- **Alarms**: CPU, Connections, Read/Write Latency
- **Dashboard**: Updated with new cluster metrics

## Next Steps

1. **Test Connectivity**: Verify the new cluster is accessible
2. **Update Connection Strings**: Prepare new connection configuration
3. **Run Migration Scripts**: Execute data migration from old cluster
4. **Validate Data**: Ensure all data migrated correctly
5. **Update Application**: Point application to new cluster
6. **Monitor Performance**: Watch metrics during transition

## Connection Information

To connect to the new cluster, retrieve credentials from Secrets Manager:

\`\`\`bash
aws secretsmanager get-secret-value \\
    --secret-id "$SECRET_ARN" \\
    --profile "$AWS_PROFILE" \\
    --region "$AWS_REGION" \\
    --query 'SecretString' \\
    --output text
\`\`\`

## Important Notes

- **TLS Required**: The new cluster has TLS enabled, ensure your application supports it
- **Certificate**: Download the RDS CA certificate for TLS connections
- **Connection Pooling**: Optimize for Lambda with single connection per invocation
- **Testing**: Test thoroughly before switching production traffic

## Rollback Plan

If issues occur, you can:
1. Keep the old cluster running during migration
2. Switch connection strings back to old cluster
3. Use the backup created before migration
4. Delete the new cluster if needed (non-prod environments)

---

*Deployment completed successfully*
*Stack Name: ChronasDBMigration-$ENVIRONMENT*
*CDK App: $CDK_APP*
EOF

# Display summary
log "Deployment completed successfully!"
echo "----------------------------------------"
echo -e "${GREEN}Deployment Summary:${NC}"
echo "Cluster Endpoint: $CLUSTER_ENDPOINT"
echo "Cluster ID: $CLUSTER_ID"
echo "Secret ARN: $SECRET_ARN"
echo "Summary File: $DEPLOYMENT_SUMMARY"
echo "----------------------------------------"

# Test cluster connectivity
log "Testing cluster connectivity..."
if [ "$CLUSTER_ENDPOINT" != "Not available" ]; then
    # Get credentials for testing
    SECRET_JSON=$(aws secretsmanager get-secret-value \
        --secret-id "$SECRET_ARN" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --query 'SecretString' \
        --output text 2>/dev/null || echo "{}")
    
    if [ "$SECRET_JSON" != "{}" ]; then
        DOCDB_HOST=$(echo "$SECRET_JSON" | jq -r '.host' 2>/dev/null || echo "")
        DOCDB_PORT=$(echo "$SECRET_JSON" | jq -r '.port' 2>/dev/null || echo "27017")
        
        if [ -n "$DOCDB_HOST" ]; then
            info "Testing network connectivity to $DOCDB_HOST:$DOCDB_PORT..."
            if timeout 10 bash -c "</dev/tcp/$DOCDB_HOST/$DOCDB_PORT" 2>/dev/null; then
                log "✓ Network connectivity successful"
            else
                warn "✗ Network connectivity failed (this may be expected if not running from VPC)"
            fi
        fi
    fi
else
    warn "Could not retrieve cluster endpoint for connectivity test"
fi

log "DocumentDB migration cluster deployment completed!"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Review the deployment summary: $DEPLOYMENT_SUMMARY"
echo "2. Test connectivity from your application environment"
echo "3. Proceed with data migration scripts (Task 1.3)"
echo "4. Update application configuration to use new cluster"