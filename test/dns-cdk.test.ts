import { DnsStack } from '../lib/dns-stack';
import * as cdk from 'aws-cdk-lib';
import { Template, } from 'aws-cdk-lib/assertions';

test('DnsStack', () => {
  const app = new cdk.App();
  const stack = new DnsStack(app, 'TestStack');

  // Assertions
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CertificateManager::Certificate', {
    DomainName: 'chronas-api-fargate.chronas.org',
  });
});
