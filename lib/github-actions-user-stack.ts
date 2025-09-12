import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export class GitHubActionsUserStack extends cdk.Stack {
  public readonly user: iam.User;
  public readonly accessKey: iam.CfnAccessKey;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create IAM user for GitHub Actions
    this.user = new iam.User(this, 'GitHubActionsUser', {
      userName: 'chronas-github-actions-user',
      path: '/service-accounts/',
    });

    // Create access key for the user
    this.accessKey = new iam.CfnAccessKey(this, 'GitHubActionsAccessKey', {
      userName: this.user.userName,
    });

    // Policy for S3 operations
    const s3Policy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
        's3:PutObjectAcl',
        's3:GetObjectVersion',
        's3:DeleteObjectVersion',
      ],
      resources: [
        `arn:aws:s3:::chronas-frontend-${this.account}`,
        `arn:aws:s3:::chronas-frontend-${this.account}/*`,
      ],
    });

    // Policy for CloudFront operations
    const cloudFrontPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudfront:CreateInvalidation',
        'cloudfront:GetInvalidation',
        'cloudfront:ListInvalidations',
        'cloudfront:GetDistribution',
        'cloudfront:GetDistributionConfig',
      ],
      resources: ['*'], // CloudFront doesn't support resource-level permissions
    });

    // Attach policies to user
    this.user.addToPolicy(s3Policy);
    this.user.addToPolicy(cloudFrontPolicy);

    // Outputs
    new cdk.CfnOutput(this, 'GitHubActionsUserName', {
      value: this.user.userName,
      description: 'IAM User name for GitHub Actions',
    });

    new cdk.CfnOutput(this, 'GitHubActionsAccessKeyId', {
      value: this.accessKey.ref,
      description: 'Access Key ID for GitHub Actions (add to GitHub secrets)',
    });

    new cdk.CfnOutput(this, 'GitHubActionsSecretAccessKey', {
      value: this.accessKey.attrSecretAccessKey,
      description: 'Secret Access Key for GitHub Actions (add to GitHub secrets)',
    });

    // Warning output
    new cdk.CfnOutput(this, 'SecurityWarning', {
      value: 'IMPORTANT: Copy the Secret Access Key immediately - it will not be shown again!',
      description: 'Security reminder',
    });
  }
}
