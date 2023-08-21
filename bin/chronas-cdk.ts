#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DatabaseStack } from '../lib/database-stack';
import { NetworkStack } from '../lib/network-stack';
import { SecretStack } from '../lib/secret-stack';

import { CloudWatchStack } from '../lib/cloudwatch-stack';
import { DnsStack } from '../lib/dns-stack';
import { ChronasApiLambaStack } from '../lib/chronas-api-lambda-stack';
import { BuildChronasAPiStack } from '../lib/build-chronas-api-stack';
import { AmplifyStack} from '../lib/amplify-stack';

const app = new cdk.App();
const secretsManagerSecretName = '/chronas/docdb/newpassword';

//create a new CDK stack for networkStack
const secretStack = new SecretStack(app, 'SecretStack')
cdk.Tags.of(secretStack).add('auto-delete', 'never');
cdk.Tags.of(secretStack).add('auto-stop', 'no');

//create a new CDK stack for networkStack
const cloudwatchStack = new CloudWatchStack(app, 'CloudwatchStack')
cdk.Tags.of(secretStack).add('auto-delete', 'never');
cdk.Tags.of(secretStack).add('auto-stop', 'no');

//create a new CDK stack for networkStack
const networkStack = new NetworkStack(app, 'NetworkStack')
cdk.Tags.of(networkStack).add('auto-delete', 'never');
cdk.Tags.of(networkStack).add('auto-stop', 'no');

//create a new CDK stack for Building the chronas-API and push it to an ECR repostory
const buildChronasApi = new BuildChronasAPiStack(app, 'BuildChronasAPi', { 
    chronasGithubtoken: secretStack.chronasGithubtoken, 
    docker_username: secretStack.docker_username, 
    docker_password: secretStack.docker_password
})
cdk.Tags.of(buildChronasApi).add('auto-delete', 'never');
cdk.Tags.of(buildChronasApi).add('auto-stop', 'no');

//create a new CDK stack for databaseStack
const databaseStack = new DatabaseStack(app, 'DatabaseStack', {
    vpc: networkStack.vpc, 
    secretName: secretsManagerSecretName, 
    cloudwatchChronasDashboard: cloudwatchStack.cloudwatchChronasDashboard
});
cdk.Tags.of(databaseStack).add('auto-delete', 'never');
cdk.Tags.of(databaseStack).add('auto-stop', 'no');

//create a new CDK stack for DNS Stack
const dnsStack = new DnsStack(app, 'DnsStack');
cdk.Tags.of(networkStack).add('auto-delete', 'never');
cdk.Tags.of(networkStack).add('auto-stop', 'no');

//create a new CDK stack for publishing the frontend to Amplify
const amplifyStack = new AmplifyStack(app, 'AmplifyStack', { 
    githubtoken: secretStack.chronasGithubtoken 
})
cdk.Tags.of(amplifyStack).add('auto-delete', 'never');
cdk.Tags.of(amplifyStack).add('auto-stop', 'no');

//create a new CDK stack for API Deployment to Lambda
const chronasApiLambda = new ChronasApiLambaStack(app, 'ChronasApiLambdaStack', {
    vpc: networkStack.vpc, 
    apiCertificate:  dnsStack.apiCertificate, 
    repositoryChronasApi: buildChronasApi.repositoryChronasApi, 
    dbSecret: databaseStack.dbSecret, 
    cronasConfig: secretStack.chronasSecrets,
    cloudwatchChronasDashboard: cloudwatchStack.cloudwatchChronasDashboard
});
chronasApiLambda.addDependency(databaseStack);
chronasApiLambda.addDependency(buildChronasApi);

/*
//create a cdk stack which is hosting the API on Fargate
const chronasStack = new ChronasCdkStack(app, 'ChronasCdkStack', {vpc: networkStack.vpc, secretName: secretsManagerSecretName, apiCertificate:  dnsStack.apiCertificate});
chronasStack.addDependency(databaseStack);
cdk.Tags.of(chronasStack).add('auto-delete', 'never');
cdk.Tags.of(chronasStack).add('auto-stop', 'no');
*/