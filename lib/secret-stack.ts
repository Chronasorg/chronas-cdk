import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class SecretStack extends cdk.Stack {
  chronasGithubtoken: secretsmanager.Secret;
  docker_username: secretsmanager.Secret;
  docker_password: secretsmanager.Secret;
  chronasSecrets: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create 3 secrets (githubtoken, docker_username, docker_password) in AWS secrets manager

    this.chronasGithubtoken = new secretsmanager.Secret(this, 'chronasgithubtoken', {
      secretName: 'chronasgithubtoken',
      description: 'Chronas GitHub token'
    });

    this.docker_username = new secretsmanager.Secret(this, 'docker_username', {
      secretName: 'docker_username',
      description: 'Docker username'
    });

    this.docker_password = new secretsmanager.Secret(this, 'docker_password', {
      secretName: 'docker_password',
      description: 'Docker password'
    });

    this.chronasSecrets = new secretsmanager.Secret(this, 'chronas-secrets', {
      secretName: '/chronas/secrets',
      description: 'Chronas secrets',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          JWT_SECRET: 'myJWT_SECRET',
          MAILGUN_KEY: 'myMAILGUN_KEY',
          MAILGUN_DOMAIN: 'myJWT_SECRET',
          MAILGUN_RECEIVER: 'myTWITTER_CONSUMER_KEY',
          TWITTER_CONSUMER_KEY: 'myTWITTER_CONSUMER_KEY',
          TWITTER_CONSUMER_SECRET: 'myTWITTER_CONSUMER_SECRET',
          APPINSIGHTS_INSTRUMENTATIONKEY: 'myJWT_SECRET',
          CLOUDINARY_URL: 'myMAILGUN_KEY',
          FACEBOOK_CLIENT_ID: 'myTWITTER_CONSUMER_KEY',
          FACEBOOK_CLIENT_SECRET: 'myTWITTER_CONSUMER_SECRET',
          GITHUB_CLIENT_ID: 'myJWT_SECRET',
          GITHUB_CLIENT_SECRET: 'myMAILGUN_KEY',
          GOOGLE_CLIENT_ID: 'myTWITTER_CONSUMER_KEY',
          GOOGLE_CLIENT_SECRET: 'myTWITTER_CONSUMER_SECRET',
          PAYPAL_CLIENT_ID: 'myTWITTER_CONSUMER_SECRET',
        }),
        generateStringKey: 'JWT_SECRET'}
    });    
  }
}
