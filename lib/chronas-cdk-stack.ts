import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';

export class ChronasCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, params: { vpc: ec2.Vpc, secretName: string, apiCertificate: acm.Certificate }, props?: cdk.StackProps) {
    super(scope, id, props);

    // ECS stuff
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
    );
    taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess')
    );
    taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite')
    );

    const executionRole = new iam.Role(this, 'ExecutionkRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    executionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
    );

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      taskRole,
      executionRole,
      cpu: 1024,
      memoryLimitMiB: 2048,
    });

    const nodeServiceContainer = taskDefinition.addContainer('ChronasService', {
      //image: ecs.ContainerImage.fromEcrRepository(repository, ''),
      image: ecs.ContainerImage.fromRegistry('aumanjoa/chronas-api:b189959'),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'ChronasApp',
      }),

      environment: {
        'DEBUG': 'chronas-api:*',
        'region': this.region,
        'secretsManagerSecretName': params.secretName,
        'NODE_ENV': 'development',
        "PORT": "80",
        "APPINSIGHTS_INSTRUMENTATIONKEY": "placeholder",
        "TWITTER_CONSUMER_KEY": "placeholder",
        "TWITTER_CONSUMER_SECRET": "placeholder",
        "JWT_SECRET": "placeholder",
        "MAILGUN_KEY": "placeholder",
        "CHRONAS_HOST": "https://chronas.org",
        "FACEBOOK_CALLBACK_URL": "https://api.chronas.org/v1/auth/login/facebook",
        "GOOGLE_CALLBACK_URL": "https://api.chronas.org/v1/auth/login/google",
        "GITHUB_CALLBACK_URL": "https://api.chronas.org/v1/auth/login/github",
        "TWITTER_CALLBACK_URL": "https://api.chronas.org/v1/auth/login/twitter"
      }
    });

    nodeServiceContainer.addPortMappings({
      containerPort: 80,
    });

    const xray = taskDefinition.addContainer('xray', {
      image: ecs.ContainerImage.fromRegistry('amazon/aws-xray-daemon'),
      cpu: 32,
      memoryReservationMiB: 256,
      essential: false,
    });
    xray.addPortMappings({
      containerPort: 2000,
      protocol: ecs.Protocol.UDP,
    });


    //ecs load balancer fargate tas
    const cluster = new ecs.Cluster(this, 'ChronasCluster', { vpc: params.vpc });

    //create a capacityProviderStrategies for fargate spot ract
    const capacityProviderStrategies = [{
      capacityProvider: 'FARGATE_SPOT',
      weight: 1,
    }];

    const ecsService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'ECSChronasService', {
      cluster,
      taskDefinition,
      certificate: params.apiCertificate,
      capacityProviderStrategies: capacityProviderStrategies,
      taskSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    ecsService.targetGroup.configureHealthCheck({
      path: '/v1/welcome',
      interval: cdk.Duration.seconds(10),
      timeout: cdk.Duration.seconds(5)
    });

    // Add autoscaling
    const scaling = ecsService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 10
    });

    // Scale on CPU utilization
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 50
    });

  }
}