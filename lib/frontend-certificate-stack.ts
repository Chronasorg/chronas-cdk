import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';

export class FrontendCertificateStack extends cdk.Stack {
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import existing hosted zone from eu-west-1
    const hostedZone = route53.PublicHostedZone.fromLookup(this, 'ChronasHostedZone', {
      domainName: 'chronas.org',
    });

    // Create certificate for frontend (chronas.org) in us-east-1 for CloudFront
    this.certificate = new acm.Certificate(this, 'ChronasFrontendCertificate', {
      domainName: 'chronas.org',
      subjectAlternativeNames: ['*.chronas.org'],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // Output the certificate ARN for use in CloudFront stack
    new cdk.CfnOutput(this, 'FrontendCertificateArn', {
      value: this.certificate.certificateArn,
      description: 'SSL Certificate ARN for chronas.org (for CloudFront)',
      exportName: 'ChronasFrontendCertificateArn',
    });
  }
}
