# Database Migration Deployment Plan

## Task 8.1: Deploy Migration Infrastructure

### Prerequisites

Before deploying the DatabaseMigrationStack, ensure these stacks are deployed:

1. **SecretStack** - Manages secrets for database credentials
2. **NetworkStack** - Provides VPC for DocumentDB cluster
3. **CloudWatchStack** - Provides monitoring dashboard

### Deployment Order

#### Phase 1: Core Infrastructure
```bash
# 1. Deploy secrets management
npx cdk deploy SecretStack --profile chronas-dev

# 2. Deploy networking
npx cdk deploy NetworkStack --profile chronas-dev

# 3. Deploy monitoring
npx cdk deploy CloudwatchStack --profile chronas-dev
```

#### Phase 2: Database Migration Infrastructure
```bash
# 4. Deploy new DocumentDB cluster
npx cdk deploy DatabaseMigrationStack --profile chronas-dev
```

### DatabaseMigrationStack Components

The DatabaseMigrationStack will create:

1. **DocumentDB 5.0 Cluster**
   - Latest engine version (5.0.0)
   - Optimized for Lambda workloads
   - TLS enabled for security
   - Multi-AZ for production resilience

2. **Parameter Group**
   - TLS enabled
   - TTL monitoring enabled
   - Profiler enabled for performance monitoring
   - Audit logs enabled for compliance
   - Optimized for Lambda connections

3. **CloudWatch Monitoring**
   - CPU utilization alarms
   - Connection count monitoring
   - Read/write latency tracking
   - IOPS monitoring
   - Custom dashboard

4. **Security Configuration**
   - VPC deployment for network isolation
   - Security groups for Lambda access
   - Encrypted storage
   - Deletion protection for production

### Verification Steps

After deployment, verify:

1. **DocumentDB Cluster Status**
   ```bash
   aws docdb describe-db-clusters --profile chronas-dev
   ```

2. **Security Group Configuration**
   ```bash
   aws ec2 describe-security-groups --profile chronas-dev
   ```

3. **CloudWatch Dashboard**
   - Check AWS Console for new dashboard
   - Verify metrics are being collected

4. **Secrets Manager**
   ```bash
   aws secretsmanager list-secrets --profile chronas-dev
   ```

### Expected Outputs

The stack will output:
- DocumentDB cluster endpoint
- Secret ARN for database credentials
- Cluster identifier for reference

### Troubleshooting

Common issues and solutions:

1. **VPC Not Found**
   - Ensure NetworkStack is deployed first
   - Check VPC ID in AWS Console

2. **Insufficient Permissions**
   - Verify IAM permissions for DocumentDB
   - Check VPC and subnet permissions

3. **Parameter Group Issues**
   - Verify DocumentDB 5.0 parameter compatibility
   - Check parameter group family setting

4. **Security Group Conflicts**
   - Ensure no conflicting security group rules
   - Verify VPC CIDR block access

### Cost Considerations

The DatabaseMigrationStack will incur costs for:
- DocumentDB instances (t4g.medium for dev)
- Storage (encrypted)
- Backup retention
- CloudWatch metrics and alarms

Estimated monthly cost for dev environment: ~$150-200 USD

### Next Steps After Deployment

1. Test connectivity from Lambda environment
2. Prepare data migration scripts
3. Execute development data migration
4. Validate data integrity
5. Update application configuration