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
          TWITTER_CONSUMER_KEY: 'myTWITTER_CONSUMER_KEY',
          TWITTER_CONSUMER_SECRET: 'myTWITTER_CONSUMER_SECRET',

        }),
        generateStringKey: 'JWT_SECRET'}
    });    
  }
}
