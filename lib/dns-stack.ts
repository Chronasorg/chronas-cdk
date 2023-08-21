import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

export class DnsStack extends cdk.Stack {
  apiCertificate: acm.Certificate;
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //create a new certificate in the certificate manager for the domain 'chronas-api-lambda.chronas.org'
    this.apiCertificate = new acm.Certificate(this, 'ChronasApiLambdaCertificate', {
      domainName: 'chronas-api-lambda.chronas.org',
      validation: acm.CertificateValidation.fromDns(),
    }
    );
  }
}