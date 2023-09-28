import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as SecretManager from 'aws-cdk-lib/aws-secretsmanager';

export class AmplifyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, params: { githubtoken: SecretManager.Secret},  props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an Amplify frontend app
    const amplifyApp = new amplify.CfnApp(this, 'ChronasFrontend', {
      name: 'ChronasFrontend', // Provide a name for your Amplify app
      repository: 'https://github.com/Chronasorg/chronas', // Specify the GitHub repository URL
      oauthToken: params.githubtoken.secretValue.unsafeUnwrap(),  // Replace with your GitHub OAuth token (personal access token)
    });

    // Deploy the Amplify app
    new amplify.CfnBranch(this, 'AmplifyMasterBranch', {
      appId: amplifyApp.attrAppId,
      branchName: 'master', // Specify the branch you want to deploy (e.g., 'main', 'master')
    });    

  }
}
