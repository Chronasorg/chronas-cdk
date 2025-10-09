#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SyntheticMonitoringOnlyStack } from '../lib/synthetic-monitoring-only-stack.js';

const app = new cdk.App();

// Get configuration from context or environment variables
const environment = app.node.tryGetContext('environment') || process.env.ENVIRONMENT || 'development';
const alertEmail = app.node.tryGetContext('alertEmail') || process.env.ALERT_EMAIL;

console.log('🔍 Deploying Chronas Synthetic Monitoring with configuration:');
console.log(`  Environment: ${environment}`);
console.log(`  Alert Email: ${alertEmail || 'Not specified'}`);
console.log(`  📊 Canaries: 6 comprehensive test suites monitoring api.chronas.org`);

new SyntheticMonitoringOnlyStack(app, `ChronasSyntheticMonitoring-${environment}-v2`, {
  alertEmail,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'eu-west-1'
  },
  description: `Chronas API Synthetic Monitoring for ${environment} environment - Monitors api.chronas.org endpoints`
});