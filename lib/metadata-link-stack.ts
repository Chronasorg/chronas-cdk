import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Table, AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';

import * as apigw from '@aws-cdk/aws-apigatewayv2-alpha'

import path = require('path');


export class MetaDataLinkStack extends cdk.Stack {

  constructor(scope: Construct, id: string, params: {
    httpApi: apigw.HttpApi
  },props?: cdk.StackProps) {
    super(scope, id, props);

    //Dynamodb table definition
    // Create the DynamoDB table
    const table = new Table(this, 'masterdata', {
      tableName: 'MyTable',
      partitionKey: { name: '_id', type: AttributeType.STRING }
    });

    // Lambda function
    const lambdaPutDynamoDB = new NodejsFunction(this, 'lambdaPutDynamoDBHandler', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'handler',
      timeout: cdk.Duration.seconds(3),
      entry: path.join(__dirname, '../lambda/metadata-links/app.ts'),
      environment: {
        HELLO_TABLE_NAME: table.tableName,
      },
    });

        // Create an integration between the API Gateway and the Lambda function
    const lambdaIntegration = new HttpLambdaIntegration('MetaDataLinks', lambdaPutDynamoDB);

    //create a reoute for /v1
    params.httpApi.addRoutes({
      path: '/v1/metadata/links',
      methods: [apigw.HttpMethod.ANY],
      integration: lambdaIntegration,
    });

    // Write permissions for Lambda
    table.grantReadWriteData(lambdaPutDynamoDB);
  
  }
}