import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
//import * as logs from 'aws-cdk-lib/aws-logs';
//import * as iam from 'aws-cdk-lib/aws-iam';

export class NetworkStack extends cdk.Stack {
  vpc: ec2.Vpc
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create VPC
    this.vpc = new ec2.Vpc(this, 'chronasVpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'PublicSubnet1',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'PrivateSubnet1',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
      natGateways: 0,
    });       

    /*
    // Create Flow Logs
    const logGroup = new logs.LogGroup(this, 'VPCFlowLogs');
    
    const role = new iam.Role(this, 'MyCustomRoleFlowLogs', {
      assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com')
    });    

    this.vpc.addFlowLog("vpcFlowLog", {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(logGroup, role),
      trafficType: ec2.FlowLogTrafficType.REJECT,
    });
    */

    //create a vpc endpoint for AWS Secrets Manager
    const smEndpoint = this.vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      privateDnsEnabled: true,
    });

    smEndpoint.connections.allowDefaultPortFromAnyIpv4('Allow Secrets Manager');
  }
}