import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as apigw from '@aws-cdk/aws-apigatewayv2-alpha'

import { Construct } from 'constructs';

export class ChronasApiLambaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, params: {
    vpc: ec2.Vpc,
    repositoryChronasApi: ecr.Repository,
    dbSecret: secretsmanager.ISecret,
    cronasConfig: secretsmanager.ISecret,
    cloudwatchChronasDashboard: cloudwatch.Dashboard
    httpApi: apigw.HttpApi
  }, props?: cdk.StackProps) {
    super(scope, id, props);

    //lambda function which is hosting a container image from ecr and can connect to a vpc
    // the lambda function is deployed to the vpc and can access the secretsManager

    const chronasConfig = params.cronasConfig.secretValue.unsafeUnwrap(); // TODO: fix this, workaround for legacy code

    const lambdaFunction = new cdk.aws_lambda.DockerImageFunction(this, 'ChronasApiLambdaFunction', {
      code: cdk.aws_lambda.DockerImageCode.fromEcr(params.repositoryChronasApi, { tagOrDigest: 'chronas-api-9f18675' }),
      memorySize: 300,
      timeout: cdk.Duration.seconds(300),
      tracing: cdk.aws_lambda.Tracing.ACTIVE,
      environment: {
        'VPC_ID': params.vpc.vpcId,
        'SECRET_DB_NAME': params.dbSecret.secretName,
        'SECRET_CONFIG_NAME': params.cronasConfig.secretName,
        'DEBUG': 'chronas-api:*',
        'region': this.region,
        'NODE_ENV': 'development',
        "PORT": "8080",
        "chronasConfig": chronasConfig,
        "CHRONAS_HOST": "https://chronas.org",
        "FACEBOOK_CALLBACK_URL": "https://api.chronas.org/v1/auth/login/facebook",
        "GOOGLE_CALLBACK_URL": "https://api.chronas.org/v1/auth/login/google",
        "GITHUB_CALLBACK_URL": "https://api.chronas.org/v1/auth/login/github",
        "TWITTER_CALLBACK_URL": "https://api.chronas.org/v1/auth/login/twitter"
      },
      vpc: params.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      }
    });

    lambdaFunction.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [params.dbSecret.secretFullArn!, params.cronasConfig.secretFullArn!],
      effect: cdk.aws_iam.Effect.ALLOW
    }));

    // Create an integration between the API Gateway and the Lambda function
    const lambdaIntegration = new HttpLambdaIntegration('ChronasApiIntegration', lambdaFunction);

    // Create a default route and associate the Lambda integration with it
    params.httpApi.addRoutes({
      path: '/',
      methods: [apigw.HttpMethod.ANY],
      integration: lambdaIntegration,
    });

    //create a reoute for /v1
    params.httpApi.addRoutes({
      path: '/v1/{proxy+}',
      methods: [apigw.HttpMethod.ANY],
      integration: lambdaIntegration,
    });
/*
    // Add Lambda metrics to the dashboard
    const lambdaErrorsMetric = lambdaFunction.metricErrors({ period: cdk.Duration.seconds(1) });
    const lambdaDurationMetric = lambdaFunction.metricDuration({ period: cdk.Duration.seconds(1) });
    const lambdaInvocationsMetric = lambdaFunction.metricInvocations({ period: cdk.Duration.seconds(1) });
    const LambdaFunctionThrottlesMetric = lambdaFunction.metricThrottles({ period: cdk.Duration.seconds(1) });
    const LambdaFunctionDurration = lambdaFunction.metricDuration(
      {
        label: 'Duration',
        period: cdk.Duration.seconds(1),
        statistic: 'Average',
        unit: cloudwatch.Unit.SECONDS
      });

    params.cloudwatchChronasDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda API Innvocations',
        left: [lambdaInvocationsMetric],
      })
    );

    params.cloudwatchChronasDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Function Errors Metrics',
        left: [lambdaErrorsMetric],
      })
    );

    params.cloudwatchChronasDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda API Durrations Metrics',
        left: [lambdaDurationMetric],
      })
    );

    params.cloudwatchChronasDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda API Throttles',
        left: [LambdaFunctionThrottlesMetric],
      })
    );

    params.cloudwatchChronasDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda API Durrations',
        left: [LambdaFunctionDurration],
      })
    );

    // Create a custom CloudWatch metric for Lambda Concurrent Executions
    const concurrentExecutionsMetric = new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'ConcurrentExecutions',
      dimensionsMap: {
        FunctionName: lambdaFunction.functionName,
      },
      statistic: 'Maximum', // Choose the desired statistic, e.g., Average, Maximum, Minimum, SampleCount, Sum
      period: cdk.Duration.seconds(1), // Adjust the period as needed
    });

    params.cloudwatchChronasDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Concurrent Executions',
        left: [concurrentExecutionsMetric],
      })
    );*/
  }
}