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

    // Create a CodeBuild project
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
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
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
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
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
  }
}
