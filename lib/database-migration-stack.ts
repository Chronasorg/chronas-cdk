import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as docdb from 'aws-cdk-lib/aws-docdb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface DatabaseMigrationStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  secretName: string;
  environment: 'dev' | 'staging' | 'prod';
}

export class DatabaseMigrationStack extends cdk.Stack {
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly cluster: docdb.DatabaseCluster;

  constructor(scope: Construct, id: string, props: DatabaseMigrationStackProps) {
    super(scope, id, props);

    // Create optimized parameter group for DocumentDB 5.0
    const parameterGroup = new docdb.ClusterParameterGroup(this, 'ModernizedDocDBParams', {
      dbClusterParameterGroupName: `chronas-modernized-${props.environment}-params`,
      parameters: {
        // Enable TLS for security (required for production)
        tls: 'enabled',
        // Enable TTL monitoring for automatic document expiration
        ttl_monitor: 'enabled',
        // Enable profiler for performance monitoring
        profiler: 'enabled',
        // Enable audit logs for security compliance
        audit_logs: 'enabled',
        // Optimize for Lambda workloads
        change_stream_log_retention_duration: '10800', // 3 hours
        // Performance optimizations - using valid DocumentDB 5.0 parameters
        profiler_threshold_ms: '100',
      },
      family: 'docdb5.0',
      description: 'Optimized parameter group for modernized Chronas API with Lambda integration',
    });

    // Create CloudWatch dashboard for monitoring
    const dashboard = new cloudwatch.Dashboard(this, 'DocumentDBDashboard', {
      dashboardName: `chronas-docdb-${props.environment}`,
    });

    // Create log group for DocumentDB logs
    const logGroup = new logs.LogGroup(this, 'DocumentDBLogGroup', {
      logGroupName: `/aws/docdb/${id.toLowerCase()}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Create the modernized DocumentDB cluster
    this.cluster = new docdb.DatabaseCluster(this, 'ModernizedDatabase', {
      masterUser: {
        username: 'chronas_admin',
        excludeCharacters: '"@/\\\'`', // Exclude problematic characters
        secretName: `${props.secretName}-modernized`,
      },
      // Use latest DocumentDB engine version (5.0 compatible with MongoDB 5.0)
      engineVersion: '5.0.0',
      // Optimize instance type based on environment
      instanceType: props.environment === 'prod' 
        ? ec2.InstanceType.of(ec2.InstanceClass.R6G, ec2.InstanceSize.LARGE)
        : ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
      // Multi-AZ for production, single AZ for dev
      instances: props.environment === 'prod' ? 3 : 1,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      parameterGroup: parameterGroup,
      // Enhanced backup configuration
      backup: {
        retention: props.environment === 'prod' 
          ? cdk.Duration.days(30) 
          : cdk.Duration.days(7),
        preferredWindow: '03:00-04:00', // UTC
      },
      preferredMaintenanceWindow: 'sun:04:00-sun:05:00', // UTC
      // Security settings
      storageEncrypted: true,
      deletionProtection: props.environment === 'prod'
    });

    // Apply appropriate removal policy
    this.cluster.applyRemovalPolicy(
      props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
    );

    // Configure security group for Lambda access
    this.cluster.connections.allowFrom(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock), 
      ec2.Port.tcp(27017),
      'Allow DocumentDB access from VPC'
    );

    // Store the secret reference
    this.dbSecret = this.cluster.secret!;

    // Create CloudWatch alarms for monitoring
    this.createCloudWatchAlarms(props);

    // Add monitoring widgets to dashboard
    this.addMonitoringWidgets(dashboard);

    // Output important information
    new cdk.CfnOutput(this, 'DocumentDBClusterEndpoint', {
      value: this.cluster.clusterEndpoint.socketAddress,
      description: 'DocumentDB cluster endpoint',
      exportName: `${this.stackName}-ClusterEndpoint`,
    });

    new cdk.CfnOutput(this, 'DocumentDBSecretArn', {
      value: this.dbSecret.secretArn,
      description: 'DocumentDB credentials secret ARN',
      exportName: `${this.stackName}-SecretArn`,
    });

    new cdk.CfnOutput(this, 'DocumentDBClusterIdentifier', {
      value: this.cluster.clusterIdentifier,
      description: 'DocumentDB cluster identifier',
      exportName: `${this.stackName}-ClusterIdentifier`,
    });
  }

  private createCloudWatchAlarms(props: DatabaseMigrationStackProps) {
    // CPU Utilization Alarm
    const cpuAlarm = new cloudwatch.Alarm(this, 'DocumentDBHighCPU', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DocDB',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          DBClusterIdentifier: this.cluster.clusterIdentifier,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'DocumentDB CPU utilization is high',
    });

    // Connection Count Alarm
    const connectionAlarm = new cloudwatch.Alarm(this, 'DocumentDBHighConnections', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DocDB',
        metricName: 'DatabaseConnections',
        dimensionsMap: {
          DBClusterIdentifier: this.cluster.clusterIdentifier,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80, // Adjust based on instance type
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'DocumentDB connection count is high',
    });

    // Read Latency Alarm
    const readLatencyAlarm = new cloudwatch.Alarm(this, 'DocumentDBHighReadLatency', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DocDB',
        metricName: 'ReadLatency',
        dimensionsMap: {
          DBClusterIdentifier: this.cluster.clusterIdentifier,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0.2, // 200ms
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'DocumentDB read latency is high',
    });

    // Write Latency Alarm
    const writeLatencyAlarm = new cloudwatch.Alarm(this, 'DocumentDBHighWriteLatency', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DocDB',
        metricName: 'WriteLatency',
        dimensionsMap: {
          DBClusterIdentifier: this.cluster.clusterIdentifier,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0.2, // 200ms
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'DocumentDB write latency is high',
    });
  }

  private addMonitoringWidgets(dashboard: cloudwatch.Dashboard) {
    // CPU Utilization Widget
    const cpuWidget = new cloudwatch.GraphWidget({
      title: 'DocumentDB CPU Utilization (Modernized)',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/DocDB',
          metricName: 'CPUUtilization',
          dimensionsMap: {
            DBClusterIdentifier: this.cluster.clusterIdentifier,
          },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
      ],
      width: 12,
      height: 6,
    });

    // Connection Count Widget
    const connectionWidget = new cloudwatch.GraphWidget({
      title: 'DocumentDB Connections (Modernized)',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/DocDB',
          metricName: 'DatabaseConnections',
          dimensionsMap: {
            DBClusterIdentifier: this.cluster.clusterIdentifier,
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
      ],
      width: 12,
      height: 6,
    });

    // Latency Widget
    const latencyWidget = new cloudwatch.GraphWidget({
      title: 'DocumentDB Latency (Modernized)',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/DocDB',
          metricName: 'ReadLatency',
          dimensionsMap: {
            DBClusterIdentifier: this.cluster.clusterIdentifier,
          },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          label: 'Read Latency',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/DocDB',
          metricName: 'WriteLatency',
          dimensionsMap: {
            DBClusterIdentifier: this.cluster.clusterIdentifier,
          },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          label: 'Write Latency',
        }),
      ],
      width: 12,
      height: 6,
    });

    // IOPS Widget
    const iopsWidget = new cloudwatch.GraphWidget({
      title: 'DocumentDB IOPS (Modernized)',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/DocDB',
          metricName: 'ReadIOPS',
          dimensionsMap: {
            DBClusterIdentifier: this.cluster.clusterIdentifier,
          },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          label: 'Read IOPS',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/DocDB',
          metricName: 'WriteIOPS',
          dimensionsMap: {
            DBClusterIdentifier: this.cluster.clusterIdentifier,
          },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          label: 'Write IOPS',
        }),
      ],
      width: 12,
      height: 6,
    });

    // Add widgets to dashboard
    dashboard.addWidgets(cpuWidget, connectionWidget);
    dashboard.addWidgets(latencyWidget, iopsWidget);
  }
}