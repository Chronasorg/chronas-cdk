import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from '@aws-cdk/aws-apigatewayv2-alpha'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { CfnStage } from "aws-cdk-lib/aws-apigatewayv2";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';


export class ApiGatewayStack extends cdk.Stack {

  httpApi: apigw.HttpApi;

  constructor(scope: Construct, id: string, params:{

    apiCertificate: acm.Certificate;
    cloudwatchChronasDashboard: cloudwatch.Dashboard

  }, props?: cdk.StackProps) {
    super(scope, id, props);


    const dn = new apigw.DomainName(this, 'DN', {
      domainName: 'api.chronas.org',  // TODO: do not hardcode
      certificate: params.apiCertificate
    });

    // Create an HTTP API Gateway
    this.httpApi = new apigw.HttpApi(this, 'ChronasApiGateway',
      {
        
        defaultDomainMapping: {
          domainName: dn,
        }
      }
    );

   //output the url of the api gateway
   new cdk.CfnOutput(this, 'ChronasApiUrl', {
    value: this.httpApi.apiEndpoint,
    description: 'The URL of the Chronas API',
    exportName: 'ChronasApiUrl',
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
        status: '$context.status',
        responseLength: '$context.responseLength',
      }),
    };
  
    logGroup.grantWrite(new iam.ServicePrincipal('apigateway.amazonaws.com'));

  }
}