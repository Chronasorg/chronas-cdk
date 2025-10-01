import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as path from 'path';

import { Construct } from 'constructs';

export class ChronasApiLambaStack extends cdk.Stack {
  public readonly lambdaFunction: lambda.Function;

  constructor(scope: Construct, id: string, params: {
    vpc: ec2.Vpc,
    dbSecret: secretsmanager.ISecret,
    cronasConfig: secretsmanager.ISecret,
    cloudwatchChronasDashboard: cloudwatch.Dashboard
  }, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda function using Node.js 22.x native runtime with bundled code
    // Now using the latest Node.js 22.x runtime available in AWS Lambda
    // The function is deployed to the VPC and can access Secrets Manager

    const lambdaFunction = new lambda.Function(this, 'ChronasApiLambdaFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'lambda-handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../chronas-api'), {
        // Exclude large files and directories to reduce bundle size
        exclude: [
          'scripts/deploy-*',
          'scripts/test-*',
          'docs/*',
          'tests/*',
          '*.md',
          '.git*',
          '.vscode/*',
          'node_modules/.cache/*',
          'coverage/*'
        ]
      }),
      memorySize: 1024, // Increased for better performance
      timeout: cdk.Duration.seconds(30), // Reduced for better cost optimization
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        'VPC_ID': params.vpc.vpcId,
        'SECRET_DB_NAME': params.dbSecret.secretName,
        'SECRET_MODERNIZED_DB_NAME': '/chronas/dev/docdb/modernized-modernized', // Modernized DocumentDB 5.0 cluster
        'SECRET_CONFIG_NAME': params.cronasConfig.secretName,
        'DEBUG': 'chronas-api:*',
        'NODE_ENV': 'production',
        'PORT': '8080',
        'CHRONAS_HOST': 'https://chronas.org',
        'FACEBOOK_CALLBACK_URL': 'https://api.chronas.org/v1/auth/login/facebook',
        'GOOGLE_CALLBACK_URL': 'https://api.chronas.org/v1/auth/login/google',
        'GITHUB_CALLBACK_URL': 'https://api.chronas.org/v1/auth/login/github',
        'TWITTER_CALLBACK_URL': 'https://api.chronas.org/v1/auth/login/twitter',
        // Database configuration - will be loaded from Secrets Manager
        // 'MONGO_HOST': removed to force Secrets Manager usage
        // 'MONGO_PORT': removed to force Secrets Manager usage
        // JWT configuration - will be overridden by Secrets Manager
        'JWT_SECRET': 'fallback-jwt-secret-for-lambda',
        // Lambda-specific optimizations
        'NODE_OPTIONS': '--enable-source-maps --max-old-space-size=900'
      },
      vpc: params.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      // Performance optimizations
      reservedConcurrentExecutions: 10, // Adjust based on expected load
      deadLetterQueueEnabled: true,
      retryAttempts: 2,
    });

    // Grant permissions for Secrets Manager access
    lambdaFunction.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: [
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret'
      ],
      resources: [
        params.dbSecret.secretFullArn!, 
        params.cronasConfig.secretFullArn!,
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:/chronas/dev/docdb/modernized-modernized*` // Access to modernized DB secret
      ],
      effect: cdk.aws_iam.Effect.ALLOW
    }));

    // Grant permissions for VPC and networking
    lambdaFunction.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: [
        'ec2:CreateNetworkInterface',
        'ec2:DescribeNetworkInterfaces',
        'ec2:DeleteNetworkInterface',
        'ec2:AttachNetworkInterface',
        'ec2:DetachNetworkInterface'
      ],
      resources: ['*'],
      effect: cdk.aws_iam.Effect.ALLOW
    }));

    // Grant permissions for X-Ray tracing
    lambdaFunction.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords'
      ],
      resources: ['*'],
      effect: cdk.aws_iam.Effect.ALLOW
    }));

    // Export the Lambda function so it can be used by other stacks
    this.lambdaFunction = lambdaFunction;
    // Add Lambda metrics to the dashboard with optimized periods
    const lambdaErrorsMetric = lambdaFunction.metricErrors({ 
      period: cdk.Duration.minutes(5),
      statistic: 'Sum'
    });
    const lambdaDurationMetric = lambdaFunction.metricDuration({ 
      period: cdk.Duration.minutes(5),
      statistic: 'Average'
    });
    const lambdaInvocationsMetric = lambdaFunction.metricInvocations({ 
      period: cdk.Duration.minutes(5),
      statistic: 'Sum'
    });
    const lambdaThrottlesMetric = lambdaFunction.metricThrottles({ 
      period: cdk.Duration.minutes(5),
      statistic: 'Sum'
    });

    // Create a custom CloudWatch metric for Lambda Concurrent Executions
    const concurrentExecutionsMetric = new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'ConcurrentExecutions',
      dimensionsMap: {
        FunctionName: lambdaFunction.functionName,
      },
      statistic: 'Maximum',
      period: cdk.Duration.minutes(5),
    });

    // Cold start metric
    const coldStartMetric = new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'Duration',
      dimensionsMap: {
        FunctionName: lambdaFunction.functionName,
      },
      statistic: 'Maximum',
      period: cdk.Duration.minutes(5),
    });

    // Add widgets to dashboard
    params.cloudwatchChronasDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda API Invocations & Errors',
        left: [lambdaInvocationsMetric],
        right: [lambdaErrorsMetric],
        width: 12,
        height: 6,
      })
    );

    params.cloudwatchChronasDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Performance Metrics',
        left: [lambdaDurationMetric, coldStartMetric],
        right: [lambdaThrottlesMetric],
        width: 12,
        height: 6,
      })
    );

    params.cloudwatchChronasDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Concurrent Executions',
        left: [concurrentExecutionsMetric],
        width: 12,
        height: 6,
      })
    );

    // Create CloudWatch alarms for monitoring
    new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      metric: lambdaErrorsMetric,
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Lambda function error rate is high',
    });

    new cloudwatch.Alarm(this, 'LambdaDurationAlarm', {
      metric: lambdaDurationMetric,
      threshold: 25000, // 25 seconds
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Lambda function duration is high',
    });

    // Output Lambda function information
    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: lambdaFunction.functionName,
      description: 'Lambda function name',
      exportName: `${this.stackName}-LambdaFunctionName`,
    });

    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: lambdaFunction.functionArn,
      description: 'Lambda function ARN',
      exportName: `${this.stackName}-LambdaFunctionArn`,
    });
  }
}