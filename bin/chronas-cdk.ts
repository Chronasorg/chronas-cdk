#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DatabaseStack } from '../lib/database-stack';
import { NetworkStack } from '../lib/network-stack';
import { SecretStack } from '../lib/secret-stack';

import { CloudWatchStack } from '../lib/cloudwatch-stack';
import { DnsStack } from '../lib/dns-stack';
import { MetaDataLinkStack } from '../lib/metadata-link-stack';

import { ApiGatewayStack } from '../lib/api-gateway-stack';

import { ChronasApiLambaStack } from '../lib/chronas-api-lambda-stack';
import { BuildChronasAPiStack } from '../lib/build-chronas-api-stack';

import { FrontendS3Stack } from '../lib/frontend-s3-stack';
import { GitHubActionsUserStack } from '../lib/github-actions-user-stack';
import { FrontendCertificateStack } from '../lib/frontend-certificate-stack';

const app = new cdk.App();
const secretsManagerSecretName = '/chronas/docdb/newpassword';

//create a new CDK stack for Secrets
const secretStack = new SecretStack(app, 'SecretStack')
cdk.Tags.of(secretStack).add('chronas', 'never');
cdk.Tags.of(secretStack).add('auto-stop', 'no');
cdk.Tags.of(secretStack).add('app', 'chronas');


//create a new CDK stack for Cloudwatch
const cloudwatchStack = new CloudWatchStack(app, 'CloudwatchStack')
cdk.Tags.of(cloudwatchStack).add('auto-delete', 'never');
cdk.Tags.of(cloudwatchStack).add('auto-stop', 'no');
cdk.Tags.of(cloudwatchStack).add('app', 'chronas');

//create a new CDK stack for networkStack
const networkStack = new NetworkStack(app, 'NetworkStack')
cdk.Tags.of(networkStack).add('auto-delete', 'never');
cdk.Tags.of(networkStack).add('auto-stop', 'no');
cdk.Tags.of(networkStack).add('app', 'chronas');

//create a new CDK stack for Building the chronas-API and push it to an ECR repostory
const buildChronasApi = new BuildChronasAPiStack(app, 'BuildChronasAPi', { 
    chronasGithubtoken: secretStack.chronasGithubtoken, 
    docker_username: secretStack.docker_username, 
    docker_password: secretStack.docker_password
})
cdk.Tags.of(buildChronasApi).add('auto-delete', 'never');
cdk.Tags.of(buildChronasApi).add('auto-stop', 'no');
cdk.Tags.of(buildChronasApi).add('app', 'chronas');

//create a new CDK stack for databaseStack
const databaseStack = new DatabaseStack(app, 'DatabaseStack', {
    vpc: networkStack.vpc, 
    secretName: secretsManagerSecretName, 
    cloudwatchChronasDashboard: cloudwatchStack.cloudwatchChronasDashboard
});
cdk.Tags.of(databaseStack).add('auto-delete', 'never');
cdk.Tags.of(databaseStack).add('auto-stop', 'no');
cdk.Tags.of(databaseStack).add('app', 'chronas');

//create a new CDK stack for DNS Stack
const dnsStack = new DnsStack(app, 'DnsStack');
cdk.Tags.of(dnsStack).add('auto-delete', 'never');
cdk.Tags.of(dnsStack).add('auto-stop', 'no');
cdk.Tags.of(dnsStack).add('app', 'chronas');

//create a new api gateway stack 
const apiGatewayStack = new ApiGatewayStack(app, 'ApiGatewayStack', {
    apiCertificate: dnsStack.apiCertificate,
    cloudwatchChronasDashboard: cloudwatchStack.cloudwatchChronasDashboard

});
cdk.Tags.of(apiGatewayStack).add('auto-delete', 'never');
cdk.Tags.of(apiGatewayStack).add('auto-stop', 'no');
cdk.Tags.of(apiGatewayStack).add('app', 'chronas');


//create a new lambda dynamodb stack
const metadataLinksStack = new MetaDataLinkStack(app, 'MetaDataLinkStack',
    {
        httpApi: apiGatewayStack.httpApi

    });
cdk.Tags.of(metadataLinksStack).add('auto-delete', 'never');
cdk.Tags.of(metadataLinksStack).add('auto-stop', 'no');

//Amplify stack removed - using S3+CloudFront deployment instead

//create a new CDK stack for S3 + CloudFront frontend (alternative to Amplify)
const frontendS3Stack = new FrontendS3Stack(app, 'ChronasFrontendS3Stack');
cdk.Tags.of(frontendS3Stack).add('auto-delete', 'never');
cdk.Tags.of(frontendS3Stack).add('auto-stop', 'no');
cdk.Tags.of(frontendS3Stack).add('app', 'chronas');

//create IAM user for GitHub Actions deployment
const githubActionsUserStack = new GitHubActionsUserStack(app, 'GitHubActionsUserStack');
cdk.Tags.of(githubActionsUserStack).add('auto-delete', 'never');
cdk.Tags.of(githubActionsUserStack).add('auto-stop', 'no');
cdk.Tags.of(githubActionsUserStack).add('app', 'chronas');

//create SSL certificate for chronas.org in us-east-1 (required for CloudFront)
const frontendCertificateStack = new FrontendCertificateStack(app, 'FrontendCertificateStack', {
  env: { region: 'us-east-1', account: process.env.CDK_DEFAULT_ACCOUNT },
});
cdk.Tags.of(frontendCertificateStack).add('auto-delete', 'never');
cdk.Tags.of(frontendCertificateStack).add('auto-stop', 'no');
cdk.Tags.of(frontendCertificateStack).add('app', 'chronas');

//create a new CDK stack for API Deployment to Lambda
const chronasApiLambda = new ChronasApiLambaStack(app, 'ChronasApiLambdaStack', {
    vpc: networkStack.vpc, 
    repositoryChronasApi: buildChronasApi.repositoryChronasApi, 
    dbSecret: databaseStack.dbSecret, 
    cronasConfig: secretStack.chronasSecrets,
    cloudwatchChronasDashboard: cloudwatchStack.cloudwatchChronasDashboard,
    httpApi: apiGatewayStack.httpApi
});

chronasApiLambda.addDependency(databaseStack);
chronasApiLambda.addDependency(buildChronasApi);
cdk.Tags.of(chronasApiLambda).add('app', 'chronas');



/*
//create a cdk stack which is hosting the API on Fargate
const chronasStack = new ChronasCdkStack(app, 'ChronasCdkStack', {vpc: networkStack.vpc, secretName: secretsManagerSecretName, apiCertificate:  dnsStack.apiCertificate});
chronasStack.addDependency(databaseStack);
cdk.Tags.of(chronasStack).add('auto-delete', 'never');
cdk.Tags.of(chronasStack).add('auto-stop', 'no');
*/