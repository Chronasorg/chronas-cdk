import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export class CloudWatchStack extends cdk.Stack {
  
  cloudwatchChronasDashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a custom CloudWatch dashboard
    this.cloudwatchChronasDashboard = new cloudwatch.Dashboard(this, 'ChronasDashboard', {
      dashboardName: 'ChronasDashboard',
    });    
  }
}
