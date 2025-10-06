import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as SecretManager from 'aws-cdk-lib/aws-secretsmanager';

export class BuildChronasAPiStack extends cdk.Stack {

  repositoryChronasApi: ecr.Repository

  constructor(scope: Construct, id: string, params: { chronasGithubtoken: SecretManager.Secret, docker_username: SecretManager.Secret, docker_password: SecretManager.Secret }, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an ECR repository
    this.repositoryChronasApi = new ecr.Repository(this, 'chronas-api-repo',
      { removalPolicy: cdk.RemovalPolicy.DESTROY }
    );

    // Define the IAM role for CodeBuild project
    const role = new iam.Role(this, 'CodeBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    // Attach required policies to the role
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryPowerUser'));

    // Create a GitHub source credentials
    new codebuild.GitHubSourceCredentials(this, 'GitHubCreds', {
      accessToken: params.chronasGithubtoken.secretValue
    });

    // Create a CodeBuild project for Docker builds (legacy)
    new codebuild.Project(this, 'chronas-api-build', {
      source: codebuild.Source.gitHub({
        owner: 'Chronasorg',
        repo: 'chronas-api',
        webhook: true, // Enable webhook to trigger builds automatically on repository changes
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH),
        ],
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        privileged: true
      },
      environmentVariables: {
        'ECR_REPOSITORY_URI': {
          value: this.repositoryChronasApi.repositoryUri,
        },
        'DOCKER_HUB_USER': {
          value: 'docker_username',
          type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER
        },
        'DOCKER_HUB_PASSWORD': {
          value: 'docker_password',
          type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER
        }
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo information GitHub',
              'echo $CODEBUILD_WEBHOOK_TRIGGER',
              'echo Login to docker hub',
              'docker login -u $DOCKER_HUB_USER -p $DOCKER_HUB_PASSWORD',
              'echo Logging in to Amazon ECR...',
              '$(aws ecr get-login --no-include-email --region $AWS_DEFAULT_REGION)',
              'IMAGE_TAG_DYN=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
            ],
          },
          build: {
            commands: [
              'echo Build started on `date`',
              'echo Building the Docker image...',
              'docker build -t $ECR_REPOSITORY_URI:chronas-api-$IMAGE_TAG_DYN .',
              'echo Pushing the Docker image to ECR...',
              'docker push $ECR_REPOSITORY_URI:chronas-api-$IMAGE_TAG_DYN',
            ],
          },
        },
      }),
      role,
    });

    const chronasFrontendRepo = new ecr.Repository(this, 'chronas-frontend-repo',
      { removalPolicy: cdk.RemovalPolicy.DESTROY }
    );

    // Create a CodeBuild project for frontend 
     new codebuild.Project(this, 'chronas-frontend-build', {
      source: codebuild.Source.gitHub({
        owner: 'Chronasorg',
        repo: 'chronas',
        webhook: true, // Enable webhook to trigger builds automatically on repository changes
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH),
        ],
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        privileged: true
      },
      environmentVariables: {
        'ECR_REPOSITORY_URI': {
          value: chronasFrontendRepo.repositoryUri,
        },
        'DOCKER_HUB_USER': {
          value: 'docker_username',
          type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER
        },
        'DOCKER_HUB_PASSWORD': {
          value: 'docker_password',
          type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER
        }
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo information GitHub',
              'echo $CODEBUILD_WEBHOOK_TRIGGER',
              'echo Login to docker hub',
              'docker login -u $DOCKER_HUB_USER -p $DOCKER_HUB_PASSWORD',
              'echo Logging in to Amazon ECR...',
              '$(aws ecr get-login --no-include-email --region $AWS_DEFAULT_REGION)',
              'IMAGE_TAG_DYN=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
            ],
          },
          build: {
            commands: [
              'echo Build started on `date`',
              'echo Building the Docker image...',
              'docker build -t $ECR_REPOSITORY_URI:chronas-frontend-$IMAGE_TAG_DYN .',
              'echo Pushing the Docker image to ECR...',
              'docker push $ECR_REPOSITORY_URI:chronas-frontend-$IMAGE_TAG_DYN',
            ],
          },
        },
      }),
      role,
    });

    // Create a CodeBuild project for Lambda deployment
    // This will automatically build and deploy the Lambda function on main branch changes
    const lambdaDeployRole = new iam.Role(this, 'LambdaDeployRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    // Add permissions for Lambda deployment
    lambdaDeployRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'));
    lambdaDeployRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        // CDK deployment permissions
        'cloudformation:*',
        'sts:AssumeRole',
        'iam:*',
        's3:*',
        // Lambda permissions
        'lambda:*',
        // API Gateway permissions
        'apigateway:*',
        // Secrets Manager permissions
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret',
        // VPC permissions
        'ec2:CreateNetworkInterface',
        'ec2:DescribeNetworkInterfaces',
        'ec2:DeleteNetworkInterface',
        'ec2:AttachNetworkInterface',
        'ec2:DetachNetworkInterface',
        'ec2:DescribeVpcs',
        'ec2:DescribeSubnets',
        'ec2:DescribeSecurityGroups',
        // X-Ray permissions
        'xray:*'
      ],
      resources: ['*']
    }));

    new codebuild.Project(this, 'chronas-api-lambda-deploy', {
      projectName: 'chronas-api-lambda-deploy-v3',
      description: 'Automated Lambda deployment for Chronas API on main branch changes',
      source: codebuild.Source.gitHub({
        owner: 'Chronasorg',
        repo: 'chronas-api',
        webhook: true,
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH)
            .andBranchIs('main'), // Only trigger on main branch
        ],
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        computeType: codebuild.ComputeType.SMALL,
        privileged: false // No Docker needed for Lambda deployment
      },
      environmentVariables: {
        'AWS_DEFAULT_REGION': {
          value: 'eu-west-1'
        },
        'NODE_VERSION': {
          value: '22'
        }
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '22'
            },
            commands: [
              'echo Installing Node.js 22 and dependencies...',
              'node --version',
              'npm --version',
              'echo Installing CDK CLI...',
              'npm install -g aws-cdk@latest'
            ]
          },
          pre_build: {
            commands: [
              'echo Pre-build phase started on `date`',
              'echo GitHub webhook trigger: $CODEBUILD_WEBHOOK_TRIGGER',
              'echo Source version: $CODEBUILD_RESOLVED_SOURCE_VERSION',
              'echo Installing chronas-api dependencies...',
              'npm ci',
              'echo Installing CDK dependencies...',
              'cd ../chronas-cdk && npm ci',
              'echo Running tests...',
              'cd ../chronas-api && npm test',
              'echo Running integration tests...',
              'npm run test:integration'
            ]
          },
          build: {
            commands: [
              'echo Build phase started on `date`',
              'echo Building CDK...',
              'cd ../chronas-cdk && npm run build',
              'echo Deploying Lambda function...',
              'npx cdk deploy ChronasApiLambdaStackV2 --require-approval never',
              'echo Deployment completed successfully!'
            ]
          },
          post_build: {
            commands: [
              'echo Post-build phase started on `date`',
              'echo Getting stack outputs...',
              'aws cloudformation describe-stacks --stack-name ChronasApiLambdaStackV2 --region eu-west-1 --query "Stacks[0].Outputs" || echo "Could not get stack outputs"',
              'echo Running post-deployment validation...',
              'cd ../chronas-api',
              'echo Testing API health endpoint...',
              'sleep 30', // Wait for Lambda to be ready
              'npm run test:postman:dev || echo "Post-deployment tests failed - API might still be warming up"',
              'echo Build completed on `date`'
            ]
          }
        },
        reports: {
          'test-reports': {
            files: [
              'test-results*.json',
              'coverage/lcov.info'
            ],
            'base-directory': 'chronas-api'
          }
        }
      }),
      role: lambdaDeployRole,
      timeout: cdk.Duration.minutes(30), // Allow enough time for deployment
    });
  }
}