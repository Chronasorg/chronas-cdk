import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as SecretManager from 'aws-cdk-lib/aws-secretsmanager';

export class LambdaDeploymentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, params: { chronasGithubtoken: SecretManager.Secret }, props?: cdk.StackProps) {
    super(scope, id, props);

    // GitHub credentials already exist from other stacks

    // Create a CodeBuild project for Lambda deployment
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
      projectName: 'chronas-api-lambda-deploy-standalone',
      description: 'Automated Lambda deployment for Chronas API on main branch changes',
      source: codebuild.Source.gitHub({
        owner: 'Chronasorg',
        repo: 'chronas-api',
        branchOrRef: 'feature/modernize-api', // Use the modernized branch
        webhook: true,
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH)
            .andBranchIs('feature/modernize-api'), // Trigger on modernize-api branch
        ],
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true // Enable privileged mode for native dependencies
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
              'echo Installing build tools for native dependencies...',
              'yum install -y gcc-c++ make python3',
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
              'echo Cloning chronas-cdk repository...',
              'cd .. && git clone https://github.com/Chronasorg/chronas-cdk.git',
              'echo Installing CDK dependencies...',
              'cd chronas-cdk && npm ci',
              'echo Skipping tests for now - will be enabled after migration scripts are complete...'
            ]
          },
          build: {
            commands: [
              'echo Build phase started on `date`',
              'echo Discovering Lambda function name from CloudFormation stack...',
              'LAMBDA_FUNCTION_NAME=$(aws cloudformation describe-stacks --stack-name ChronasApiLambdaStackV2 --region eu-west-1 --query "Stacks[0].Outputs[?OutputKey==\'LambdaFunctionName\'].OutputValue" --output text)',
              'echo "Found Lambda function: $LAMBDA_FUNCTION_NAME"',
              'echo Creating Lambda deployment package...',
              'cd ../chronas-api',
              'zip -r lambda-deployment.zip . -x "node_modules/*" "*.git*" "tests/*" "*.md" "*.log"',
              'echo Installing production dependencies...',
              'npm ci --production',
              'zip -r lambda-deployment.zip node_modules/',
              'echo Updating Lambda function code directly...',
              'aws lambda update-function-code --function-name $LAMBDA_FUNCTION_NAME --zip-file fileb://lambda-deployment.zip --region eu-west-1',
              'echo Lambda function updated successfully!',
              'echo Waiting for function to be ready...',
              'aws lambda wait function-updated --function-name $LAMBDA_FUNCTION_NAME --region eu-west-1',
              'echo Lambda deployment completed successfully!'
            ]
          },
          post_build: {
            commands: [
              'echo Post-build phase started on `date`',
              'echo Getting stack outputs...',
              'aws cloudformation describe-stacks --stack-name ChronasApiLambdaStackV2 --region eu-west-1 --query "Stacks[0].Outputs" || echo "Could not get stack outputs"',
              'echo Skipping post-deployment tests for now...',
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