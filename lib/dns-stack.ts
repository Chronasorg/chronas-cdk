import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';

export class DnsStack extends cdk.Stack {
  apiCertificate: acm.Certificate;
  publicHostedZone: route53.PublicHostedZone;  
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //create a new certificate in the certificate manager for the domain 'chronas-api-lambda.chronas.org'
    this.apiCertificate = new acm.Certificate(this, 'ChronasApiLambdaCertificate', {
      domainName: 'chronas-api-lambda.chronas.org',
      validation: acm.CertificateValidation.fromDns(),
    }
    );

    //create public hosted zone for the domain 'chronas.org'
    this.publicHostedZone = new route53.PublicHostedZone(this, 'ChronasPublicHostedZone', {
      zoneName: 'chronas.org',
    });    
  }
}