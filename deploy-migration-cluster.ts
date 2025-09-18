#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DatabaseMigrationStack } from './lib/database-migration-stack';
import { NetworkStack } from './lib/network-stack';
// CloudWatch dashboard is now created within the database stack

const app = new cdk.App();

// Get environment from context or default to 'dev'
const environment = app.node.tryGetContext('environment') || 'dev';
const account = app.node.tryGetContext('account') || process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext('region') || 'eu-west-1';

console.log(`Deploying DocumentDB migration cluster for environment: ${environment}`);
console.log(`Account: ${account}, Region: ${region}`);

const env = { account, region };

// Create network stack (reuse existing if available)
const networkStack = new NetworkStack(app, `ChronasNetwork-${environment}`, {
  env,
  description: `Network infrastructure for Chronas ${environment} environment`,
});

// Create the new DocumentDB migration stack
const databaseMigrationStack = new DatabaseMigrationStack(app, `ChronasDBMigration-${environment}`, {
  env,
  vpc: networkStack.vpc,
  secretName: `/chronas/${environment}/docdb/modernized`,
  environment: environment as 'dev' | 'staging' | 'prod',
  description: `Modernized DocumentDB cluster for Chronas ${environment} migration`,
});

// Add dependencies
databaseMigrationStack.addDependency(networkStack);

// Add tags
const commonTags = {
  Project: 'Chronas',
  Environment: environment,
  Component: 'Database',
  Purpose: 'Migration',
  ManagedBy: 'CDK',
};

Object.entries(commonTags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});

app.synth();