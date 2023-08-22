import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Table, BillingMode, AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';

import * as apigw from '@aws-cdk/aws-apigatewayv2-alpha'

import path = require('path');


export class DynamoDbStack extends cdk.Stack {

  constructor(scope: Construct, id: string, params: {
    httpApi: apigw.HttpApi
  },props?: cdk.StackProps) {
    super(scope, id, props);

  // DynamoDB Table
    const dynamoTable = new Table(this, 'MetaDataLinks', {
      partitionKey: {name:'ID', type: AttributeType.STRING},
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Lambda function
    const lambdaPutDynamoDB = new NodejsFunction(this, 'lambdaPutDynamoDBHandler', {
      runtime: Runtime.NODEJS_18_X,
      bundling: {
        externalModules: ['aws-sdk'],
      },
      handler: 'main',
      timeout: cdk.Duration.seconds(3),
      entry: path.join(__dirname, '../lambda/metadata-links/app.ts'),
      environment: {
        DatabaseTable: dynamoTable.tableName
      }
    });

        // Create an integration between the API Gateway and the Lambda function
    const lambdaIntegration = new HttpLambdaIntegration('MetaDataLinks', lambdaPutDynamoDB);

    //create a reoute for /v1
    params.httpApi.addRoutes({
      path: '/v2/{proxy+}',
      methods: [apigw.HttpMethod.ANY],
      integration: lambdaIntegration,
    });

    // Write permissions for Lambda
    dynamoTable.grantReadWriteData(lambdaPutDynamoDB);
  
  }
}