import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as docdb from 'aws-cdk-lib/aws-docdb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';


export class DatabaseStack extends cdk.Stack {

  dbSecret: secretsmanager.ISecret; 

  constructor(scope: Construct, id: string, params: { vpc: ec2.Vpc, secretName: string ,cloudwatchChronasDashboard: cloudwatch.Dashboard}, props?: cdk.StackProps) {
    super(scope, id, props);

    const parameterGroup = new docdb.ClusterParameterGroup(this, "DDB_Parameter", {
      dbClusterParameterGroupName: "disabled-tls-parameter",
      parameters: {
        tls: "disabled",
      },
      family: "docdb3.6",
    });

    //DocumentDB
    const docDbcluster = new docdb.DatabaseCluster(this, 'Database', {
      masterUser: {
        username: 'myuser', // NOTE: 'admin' is reserved by DocumentDB
        excludeCharacters: "\"@/:", // optional, defaults to the set "\"@/" and is also used for eventually created rotations
        secretName: params.secretName, // optional, if you prefer to specify the secret name
      },
      //instanceType: ec2.InstanceType.of(ec2.InstanceClass.R5, ec2.InstanceSize.XLARGE24),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      vpc: params.vpc,
      engineVersion: "3.6",
      parameterGroup: parameterGroup,
    });

    docDbcluster.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    docDbcluster.connections.allowFrom(ec2.Peer.ipv4(params.vpc.vpcCidrBlock), ec2.Port.tcp(27017));

    this.dbSecret = docDbcluster.secret!;

    /*
    // Add a read replica for the DocumentDB cluster
    new docdb.CfnDBInstance(this, 'ReadReplicaInstance', {
      dbClusterIdentifier: docDbcluster.clusterIdentifier,
      dbInstanceClass: 'db.r5.24xlarge', // Use the desired instance class for the read replica
      availabilityZone: params.vpc.availabilityZones[0], // Choose an availability zone for the read replica
    });

    // Add a secound read replica for the DocumentDB cluster
    new docdb.CfnDBInstance(this, 'SecoundReadReplicaInstance', {
      dbClusterIdentifier: docDbcluster.clusterIdentifier,
      dbInstanceClass: 'db.r5.24xlarge', // Use the desired instance class for the read replica
      availabilityZone: params.vpc.availabilityZones[2], // Choose an availability zone for the read replica
    });    

    // Add a secound read replica for the DocumentDB cluster
    new docdb.CfnDBInstance(this, 'thirdrdReadReplicaInstance', {
      dbClusterIdentifier: docDbcluster.clusterIdentifier,
      dbInstanceClass: 'db.r5.24xlarge', // Use the desired instance class for the read replica
      availabilityZone: params.vpc.availabilityZones[1], // Choose an availability zone for the read replica
    });        
    */
/*
    // Create a custom CloudWatch metric for DocumentDB CPUUtilization
    const docDBCPUUtilizationMetric = new cloudwatch.Metric({
      namespace: 'AWS/DocDB',
      metricName: 'CPUUtilization',
      dimensionsMap: {
        DBClusterIdentifier: docDbcluster.clusterIdentifier,
      },
      period: cdk.Duration.seconds(1), // Adjust the period as needed
      statistic: 'Average', // Choose the desired statistic, e.g., Average, Maximum, Minimum, SampleCount, Sum
    });


    params.cloudwatchChronasDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DocumentDB CPU Utilization',
        left: [docDBCPUUtilizationMetric],
      })
    );

    // Create a custom CloudWatch metric for DocumentDB CPUUtilization
    const docConnections = new cloudwatch.Metric({
      namespace: 'AWS/DocDB',
      metricName: 'DatabaseConnections',
      dimensionsMap: {
        DBClusterIdentifier: docDbcluster.clusterIdentifier,
      },
      period: cdk.Duration.seconds(1), // Adjust the period as needed
      statistic: 'Sum', // Choose the desired statistic, e.g., Average, Maximum, Minimum, SampleCount, Sum
    });

    params.cloudwatchChronasDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DocumentDB Connections',
        left: [docConnections],
      })
    );    

      */

  }
}