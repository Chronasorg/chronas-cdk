import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { CfnStage } from "aws-cdk-lib/aws-apigatewayv2";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigwv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';


export class ApiGatewayStack extends cdk.Stack {

  httpApi: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, params:{

    apiCertificate?: acm.Certificate;
    cloudwatchChronasDashboard: cloudwatch.Dashboard;
    lambdaFunction?: any; // Lambda function to integrate with

  }, props?: cdk.StackProps) {
    super(scope, id, props);

    let domainMapping: apigwv2.DomainMappingOptions | undefined = undefined;

    // Only create domain name and certificate mapping for production
    if (params.apiCertificate) {
      const dn = new apigwv2.DomainName(this, 'DN', {
        domainName: 'api.chronas.org',  // TODO: do not hardcode
        certificate: params.apiCertificate
      });

      domainMapping = {
        domainName: dn,
      };
    }

    // Create an HTTP API Gateway
    this.httpApi = new apigwv2.HttpApi(this, 'ChronasApiGateway',
      {
        defaultDomainMapping: domainMapping
      }
    );

   //output the url of the api gateway
   new cdk.CfnOutput(this, 'ChronasApiGatewayEndpoint', {
    value: this.httpApi.apiEndpoint,
    description: 'The URL of the Chronas API Gateway',
    exportName: 'ChronasApiGatewayEndpoint',
  });

    // Add API Gateway metrics to the dashboard
    const apiGateway4XXErrorMetric = this.httpApi.metricClientError({ period: cdk.Duration.seconds(1) });
    const apiGateway5XXErrorMetric = this.httpApi.metricServerError({ period: cdk.Duration.seconds(1) });
    const apiGatewayCountMetric = this.httpApi.metricCount({ period: cdk.Duration.seconds(1) });
    params.cloudwatchChronasDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway Metrics',
        left: [apiGateway4XXErrorMetric, apiGateway5XXErrorMetric],
      })
    );

    params.cloudwatchChronasDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Metrics count',
        left: [apiGatewayCountMetric],
      })
    );

    const stage = this.httpApi.defaultStage!.node.defaultChild as CfnStage;
    const logGroup = new logs.LogGroup(this.httpApi, 'APIGW-AccessLogs', {
      retention: 3, // Keep logs for 90 days
    });
  
    stage.accessLogSettings = {
      destinationArn: logGroup.logGroupArn,
      format: JSON.stringify({
        requestId: '$context.requestId',
        userAgent: '$context.identity.userAgent',
        sourceIp: '$context.identity.sourceIp',
        requestTime: '$context.requestTime',
        httpMethod: '$context.httpMethod',
        path: '$context.path',
        resourcePath: '$context.resourcePath',
        status: '$context.status',
        responseLength: '$context.responseLength',
      }),
    };
  
    logGroup.grantWrite(new iam.ServicePrincipal('apigateway.amazonaws.com'));

    // Add Lambda integration if Lambda function is provided
    if (params.lambdaFunction) {
      const lambdaIntegration = new apigwv2_integrations.HttpLambdaIntegration('ChronasApiIntegration', params.lambdaFunction);

      // Create a default route and associate the Lambda integration with it
      this.httpApi.addRoutes({
        path: '/',
        methods: [apigwv2.HttpMethod.ANY],
        integration: lambdaIntegration,
      });

      //create a route for /v1
      this.httpApi.addRoutes({
        path: '/v1/{proxy+}',
        methods: [apigwv2.HttpMethod.ANY],
        integration: lambdaIntegration,
      });
    }

  }
}