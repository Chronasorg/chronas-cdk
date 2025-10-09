import * as cdk from 'aws-cdk-lib';
import * as synthetics from 'aws-cdk-lib/aws-synthetics';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface SyntheticMonitoringOnlyStackProps extends cdk.StackProps {
    alertEmail?: string;
}

export class SyntheticMonitoringOnlyStack extends cdk.Stack {
    public readonly canaries: synthetics.Canary[];
    public readonly alertTopic: sns.Topic;

    constructor(scope: Construct, id: string, props: SyntheticMonitoringOnlyStackProps) {
        super(scope, id, props);

        // Create SNS topic for alerts
        this.alertTopic = new sns.Topic(this, 'SyntheticMonitoringAlerts', {
            displayName: 'Chronas API Synthetic Monitoring Alerts',
            topicName: 'chronas-synthetic-alerts-v2'
        });

        // Add email subscription if provided
        if (props.alertEmail) {
            this.alertTopic.addSubscription(
                new subscriptions.EmailSubscription(props.alertEmail)
            );
        }

        // S3 bucket for canary artifacts
        const canaryBucket = new s3.Bucket(this, 'CanaryArtifacts', {
            bucketName: `chronas-synthetic-artifacts-v2-${this.account}`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [
                {
                    id: 'DeleteOldArtifacts',
                    expiration: cdk.Duration.days(7) // Keep artifacts for 7 days
                }
            ]
        });

        // IAM role for canaries
        const canaryRole = new iam.Role(this, 'CanaryRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
            ],
            inlinePolicies: {
                CanaryPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:PutObject',
                                's3:GetBucketLocation',
                                's3:ListAllMyBuckets',
                                'cloudwatch:PutMetricData',
                                'logs:CreateLogGroup',
                                'logs:CreateLogStream',
                                'logs:PutLogEvents'
                            ],
                            resources: [
                                canaryBucket.bucketArn,
                                `${canaryBucket.bucketArn}/*`,
                                '*'
                            ]
                        })
                    ]
                })
            }
        });

        this.canaries = [];

        // Create comprehensive canaries
        this.canaries.push(this.createHealthAndVersionCanary(canaryBucket, canaryRole));
        this.canaries.push(this.createMetadataEndpointsCanary(canaryBucket, canaryRole));
        this.canaries.push(this.createAreasAndMarkersCanary(canaryBucket, canaryRole));
        this.canaries.push(this.createStatisticsAndFlagsCanary(canaryBucket, canaryRole));
        this.canaries.push(this.createUserJourneyCanary(canaryBucket, canaryRole));
        this.canaries.push(this.createPerformanceCanary(canaryBucket, canaryRole));

        // Create alarms for all canaries
        this.createCanaryAlarms();

        // Output information
        this.createOutputs();
    }

    private createHealthAndVersionCanary(
        bucket: s3.IBucket,
        role: iam.IRole
    ): synthetics.Canary {
        const canary = new synthetics.Canary(this, 'HealthVersionCanary', {
            canaryName: 'chronas-health-version-check',
            schedule: synthetics.Schedule.rate(cdk.Duration.minutes(5)),
            test: synthetics.Test.custom({
                code: synthetics.Code.fromInline(`
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const postmanTestCanary = async function () {
    log.info('Starting Postman-style API tests');
    
    // Define test cases - hardcoded URLs
    const testCases = [
        {
            name: 'Health Check',
            url: 'https://api.chronas.org/v1/health',
            method: 'GET',
            tests: [
                { name: 'Status code is 200', check: (response) => response.statusCode === 200 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 5000 }
            ]
        },
        {
            name: 'Version Check',
            url: 'https://api.chronas.org/v1/version',
            method: 'GET',
            tests: [
                { name: 'Status code is 200', check: (response) => response.statusCode === 200 },
                { name: 'Response contains version', check: (response) => {
                    try {
                        const data = JSON.parse(response.responseBody);
                        return data.version !== undefined;
                    } catch (e) {
                        return false;
                    }
                }},
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 5000 }
            ]
        }
    ];
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    // Execute each test case
    for (const testCase of testCases) {
        await synthetics.executeStep(testCase.name.replace(/\\s+/g, '_'), async function () {
            log.info('Running test: ' + testCase.name);
            
            const startTime = Date.now();
            
            // Make HTTP request using Node.js https module
            const https = require('https');
            const url = require('url');
            
            const response = await new Promise((resolve, reject) => {
                const parsedUrl = url.parse(testCase.url);
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || 443,
                    path: parsedUrl.path,
                    method: testCase.method,
                    headers: {
                        'User-Agent': 'Chronas-Synthetic-Monitor'
                    }
                };
                
                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        resolve({
                            statusCode: res.statusCode,
                            responseBody: data,
                            headers: res.headers
                        });
                    });
                });
                
                req.on('error', (error) => {
                    reject(error);
                });
                
                req.setTimeout(10000, () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });
                
                req.end();
            });
            
            const responseTime = Date.now() - startTime;
            
            log.info(testCase.name + ' - Status: ' + response.statusCode + ', Time: ' + responseTime + 'ms');
            
            // Run all tests for this request
            for (const test of testCase.tests) {
                totalTests++;
                try {
                    const passed = test.check(response, responseTime);
                    if (passed) {
                        passedTests++;
                        log.info('✓ ' + test.name);
                    } else {
                        failedTests++;
                        log.error('✗ ' + test.name);
                    }
                } catch (error) {
                    failedTests++;
                    log.error('✗ ' + test.name + ' - Error: ' + error.message);
                }
            }
        });
    }
    
    // Log summary
    log.info('Test Summary:');
    log.info('Total Tests: ' + totalTests);
    log.info('Passed: ' + passedTests);
    log.info('Failed: ' + failedTests);
    
    if (failedTests > 0) {
        throw new Error('Some tests failed: ' + failedTests + ' out of ' + totalTests + ' tests failed');
    }
    
    log.info('All Postman-style tests passed successfully');
};

exports.handler = async () => {
    return await synthetics.executeStep('postmanTestCanary', postmanTestCanary);
};
        `),
                handler: 'index.handler'
            }),
            runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_6_2,
            role: role,
            artifactsBucketLocation: { bucket: bucket },
            failureRetentionPeriod: cdk.Duration.days(7),
            successRetentionPeriod: cdk.Duration.days(7)
        });

        return canary;
    }

    private createMetadataEndpointsCanary(
        bucket: s3.IBucket,
        role: iam.IRole
    ): synthetics.Canary {
        const canary = new synthetics.Canary(this, 'MetadataEndpointsCanary', {
            canaryName: 'chronas-metadata-endpoints',
            schedule: synthetics.Schedule.rate(cdk.Duration.minutes(10)),
            test: synthetics.Test.custom({
                code: synthetics.Code.fromInline(`
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const metadataTestCanary = async function () {
    log.info('Starting metadata endpoints tests');
    
    const testCases = [
        {
            name: 'Metadata Provinces',
            url: 'https://api.chronas.org/v1/metadata?type=g&f=provinces',
            method: 'GET',
            tests: [
                { name: 'Status code is 200', check: (response) => response.statusCode === 200 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 5000 },
                { name: 'Response contains data', check: (response) => {
                    try {
                        const data = JSON.parse(response.responseBody);
                        return data && Object.keys(data).length > 0;
                    } catch (e) {
                        return false;
                    }
                }}
            ]
        },
        {
            name: 'Metadata Cities',
            url: 'https://api.chronas.org/v1/metadata?type=g&f=cities&year=2000',
            method: 'GET',
            tests: [
                { name: 'Status code is 200', check: (response) => response.statusCode === 200 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 5000 }
            ]
        },
        {
            name: 'Metadata Search',
            url: 'https://api.chronas.org/v1/metadata?search=rome&type=g&f=cities',
            method: 'GET',
            tests: [
                { name: 'Status code is 200 or 404', check: (response) => response.statusCode === 200 || response.statusCode === 404 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 5000 }
            ]
        }
    ];
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    // Execute each test case
    for (const testCase of testCases) {
        await synthetics.executeStep(testCase.name.replace(/\\s+/g, '_'), async function () {
            log.info('Running test: ' + testCase.name);
            
            const startTime = Date.now();
            
            // Make HTTP request using Node.js https module
            const https = require('https');
            const url = require('url');
            
            const response = await new Promise((resolve, reject) => {
                const parsedUrl = url.parse(testCase.url);
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || 443,
                    path: parsedUrl.path,
                    method: testCase.method,
                    headers: {
                        'User-Agent': 'Chronas-Synthetic-Monitor'
                    }
                };
                
                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        resolve({
                            statusCode: res.statusCode,
                            responseBody: data,
                            headers: res.headers
                        });
                    });
                });
                
                req.on('error', (error) => {
                    reject(error);
                });
                
                req.setTimeout(10000, () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });
                
                req.end();
            });
            
            const responseTime = Date.now() - startTime;
            
            log.info(testCase.name + ' - Status: ' + response.statusCode + ', Time: ' + responseTime + 'ms');
            
            // Run all tests for this request
            for (const test of testCase.tests) {
                totalTests++;
                try {
                    const passed = test.check(response, responseTime);
                    if (passed) {
                        passedTests++;
                        log.info('✓ ' + test.name);
                    } else {
                        failedTests++;
                        log.error('✗ ' + test.name);
                    }
                } catch (error) {
                    failedTests++;
                    log.error('✗ ' + test.name + ' - Error: ' + error.message);
                }
            }
        });
    }
    
    // Log summary
    log.info('Metadata Tests Summary:');
    log.info('Total Tests: ' + totalTests);
    log.info('Passed: ' + passedTests);
    log.info('Failed: ' + failedTests);
    
    if (failedTests > 0) {
        throw new Error('Some metadata tests failed: ' + failedTests + ' out of ' + totalTests + ' tests failed');
    }
    
    log.info('All metadata tests passed successfully');
};

exports.handler = async () => {
    return await synthetics.executeStep('metadataTestCanary', metadataTestCanary);
};
        `),
                handler: 'index.handler'
            }),
            runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_6_2,
            role: role,
            artifactsBucketLocation: { bucket: bucket },
            failureRetentionPeriod: cdk.Duration.days(7),
            successRetentionPeriod: cdk.Duration.days(7)
        });

        return canary;
    }

    private createAreasAndMarkersCanary(
        bucket: s3.IBucket,
        role: iam.IRole
    ): synthetics.Canary {
        const canary = new synthetics.Canary(this, 'AreasMarkersCanary', {
            canaryName: 'chronas-areas-markers',
            schedule: synthetics.Schedule.rate(cdk.Duration.minutes(15)),
            test: synthetics.Test.custom({
                code: synthetics.Code.fromInline(`
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const areasMarkersCheck = async function () {
    log.info('Starting areas and markers tests');
    
    // Define test cases - hardcoded URLs
    const testCases = [
        {
            name: 'Areas 2000',
            url: 'https://api.chronas.org/v1/areas/2000',
            method: 'GET',
            tests: [
                { name: 'Status code is 200 or 404', check: (response) => response.statusCode === 200 || response.statusCode === 404 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 8000 },
                { name: 'Response is valid JSON', check: (response) => {
                    if (response.statusCode !== 200) return true;
                    try {
                        const data = JSON.parse(response.responseBody);
                        return Array.isArray(data) || typeof data === 'object';
                    } catch (e) {
                        return false;
                    }
                }}
            ]
        },
        {
            name: 'Areas 1500',
            url: 'https://api.chronas.org/v1/areas/1500',
            method: 'GET',
            tests: [
                { name: 'Status code is 200 or 404', check: (response) => response.statusCode === 200 || response.statusCode === 404 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 8000 }
            ]
        },
        {
            name: 'Markers Cities',
            url: 'https://api.chronas.org/v1/markers?year=2000&type=city',
            method: 'GET',
            tests: [
                { name: 'Status code is 200 or 404', check: (response) => response.statusCode === 200 || response.statusCode === 404 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 5000 }
            ]
        },
        {
            name: 'Markers Search',
            url: 'https://api.chronas.org/v1/markers?search=rome&type=city',
            method: 'GET',
            tests: [
                { name: 'Status code is 200 or 404', check: (response) => response.statusCode === 200 || response.statusCode === 404 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 5000 }
            ]
        }
    ];
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    // Execute each test case
    for (const testCase of testCases) {
        await synthetics.executeStep(testCase.name.replace(/\\s+/g, '_'), async function () {
            log.info('Running test: ' + testCase.name);
            
            const startTime = Date.now();
            
            // Make HTTP request using Node.js https module
            const https = require('https');
            const url = require('url');
            
            const response = await new Promise((resolve, reject) => {
                const parsedUrl = url.parse(testCase.url);
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || 443,
                    path: parsedUrl.path,
                    method: testCase.method,
                    headers: {
                        'User-Agent': 'Chronas-Synthetic-Monitor'
                    }
                };
                
                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        resolve({
                            statusCode: res.statusCode,
                            responseBody: data,
                            headers: res.headers
                        });
                    });
                });
                
                req.on('error', (error) => {
                    reject(error);
                });
                
                req.setTimeout(15000, () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });
                
                req.end();
            });
            
            const responseTime = Date.now() - startTime;
            
            log.info(testCase.name + ' - Status: ' + response.statusCode + ', Time: ' + responseTime + 'ms');
            
            // Run all tests for this request
            for (const test of testCase.tests) {
                totalTests++;
                try {
                    const passed = test.check(response, responseTime);
                    if (passed) {
                        passedTests++;
                        log.info('✓ ' + test.name);
                    } else {
                        failedTests++;
                        log.error('✗ ' + test.name);
                    }
                } catch (error) {
                    failedTests++;
                    log.error('✗ ' + test.name + ' - Error: ' + error.message);
                }
            }
        });
    }
    
    // Log summary
    log.info('Areas and Markers Tests Summary:');
    log.info('Total Tests: ' + totalTests);
    log.info('Passed: ' + passedTests);
    log.info('Failed: ' + failedTests);
    
    if (failedTests > 0) {
        throw new Error('Some areas/markers tests failed: ' + failedTests + ' out of ' + totalTests + ' tests failed');
    }
    
    log.info('All areas and markers tests passed successfully');
};

exports.handler = async () => {
    return await synthetics.executeStep('areasMarkersCheck', areasMarkersCheck);
};
        `),
                handler: 'index.handler'
            }),
            runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_6_2,
            role: role,
            artifactsBucketLocation: { bucket: bucket },
            failureRetentionPeriod: cdk.Duration.days(7),
            successRetentionPeriod: cdk.Duration.days(7)
        });

        return canary;
    }

    private createStatisticsAndFlagsCanary(
        bucket: s3.IBucket,
        role: iam.IRole
    ): synthetics.Canary {
        const canary = new synthetics.Canary(this, 'StatisticsFlagsCanary', {
            canaryName: 'chronas-statistics-flags',
            schedule: synthetics.Schedule.rate(cdk.Duration.minutes(20)),
            test: synthetics.Test.custom({
                code: synthetics.Code.fromInline(`
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const statisticsFlagsCheck = async function () {
    log.info('Starting statistics and flags tests');
    
    // Define test cases - hardcoded URLs
    const testCases = [
        {
            name: 'Statistics Endpoint',
            url: 'https://api.chronas.org/v1/statistics',
            method: 'GET',
            tests: [
                { name: 'Status code is 200 or 404', check: (response) => response.statusCode === 200 || response.statusCode === 404 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 5000 },
                { name: 'Response is valid JSON', check: (response) => {
                    if (response.statusCode !== 200) return true; // Skip JSON check for non-200 responses
                    try {
                        JSON.parse(response.responseBody);
                        return true;
                    } catch (e) {
                        return false;
                    }
                }}
            ]
        },
        {
            name: 'Flags Endpoint',
            url: 'https://api.chronas.org/v1/flags',
            method: 'GET',
            tests: [
                { name: 'Status code is 200 or 404', check: (response) => response.statusCode === 200 || response.statusCode === 404 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 5000 }
            ]
        }
    ];
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    // Execute each test case
    for (const testCase of testCases) {
        await synthetics.executeStep(testCase.name.replace(/\\s+/g, '_'), async function () {
            log.info('Running test: ' + testCase.name);
            
            const startTime = Date.now();
            
            // Make HTTP request using Node.js https module
            const https = require('https');
            const url = require('url');
            
            const response = await new Promise((resolve, reject) => {
                const parsedUrl = url.parse(testCase.url);
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || 443,
                    path: parsedUrl.path,
                    method: testCase.method,
                    headers: {
                        'User-Agent': 'Chronas-Synthetic-Monitor'
                    }
                };
                
                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        resolve({
                            statusCode: res.statusCode,
                            responseBody: data,
                            headers: res.headers
                        });
                    });
                });
                
                req.on('error', (error) => {
                    reject(error);
                });
                
                req.setTimeout(10000, () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });
                
                req.end();
            });
            
            const responseTime = Date.now() - startTime;
            
            log.info(testCase.name + ' - Status: ' + response.statusCode + ', Time: ' + responseTime + 'ms');
            
            // Run all tests for this request
            for (const test of testCase.tests) {
                totalTests++;
                try {
                    const passed = test.check(response, responseTime);
                    if (passed) {
                        passedTests++;
                        log.info('✓ ' + test.name);
                    } else {
                        failedTests++;
                        log.error('✗ ' + test.name);
                    }
                } catch (error) {
                    failedTests++;
                    log.error('✗ ' + test.name + ' - Error: ' + error.message);
                }
            }
        });
    }
    
    // Log summary
    log.info('Statistics and Flags Tests Summary:');
    log.info('Total Tests: ' + totalTests);
    log.info('Passed: ' + passedTests);
    log.info('Failed: ' + failedTests);
    
    if (failedTests > 0) {
        throw new Error('Some statistics/flags tests failed: ' + failedTests + ' out of ' + totalTests + ' tests failed');
    }
    
    log.info('All statistics and flags tests passed successfully');
};

exports.handler = async () => {
    return await synthetics.executeStep('statisticsFlagsCheck', statisticsFlagsCheck);
};
        `),
                handler: 'index.handler'
            }),
            runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_6_2,
            role: role,
            artifactsBucketLocation: { bucket: bucket },
            failureRetentionPeriod: cdk.Duration.days(7),
            successRetentionPeriod: cdk.Duration.days(7)
        });

        return canary;
    }

    private createUserJourneyCanary(
        bucket: s3.IBucket,
        role: iam.IRole
    ): synthetics.Canary {
        const canary = new synthetics.Canary(this, 'UserJourneyCanary', {
            canaryName: 'chronas-user-journey',
            schedule: synthetics.Schedule.rate(cdk.Duration.minutes(30)),
            test: synthetics.Test.custom({
                code: synthetics.Code.fromInline(`
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const userJourneyCheck = async function () {
    log.info('Starting comprehensive user journey simulation');
    
    // Define user journey test cases - hardcoded URLs
    const journeySteps = [
        {
            name: 'Health Check',
            url: 'https://api.chronas.org/v1/health',
            method: 'GET',
            critical: true,
            tests: [
                { name: 'Status code is 200', check: (response) => response.statusCode === 200 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 3000 }
            ]
        },
        {
            name: 'Load Provinces',
            url: 'https://api.chronas.org/v1/metadata?type=g&f=provinces',
            method: 'GET',
            critical: true,
            tests: [
                { name: 'Status code is 200', check: (response) => response.statusCode === 200 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 5000 },
                { name: 'Response contains data', check: (response) => {
                    try {
                        const data = JSON.parse(response.responseBody);
                        return data && Object.keys(data).length > 0;
                    } catch (e) {
                        return false;
                    }
                }}
            ]
        },
        {
            name: 'Load Areas',
            url: 'https://api.chronas.org/v1/areas/2000',
            method: 'GET',
            critical: false,
            tests: [
                { name: 'Status code is 200 or 404', check: (response) => response.statusCode === 200 || response.statusCode === 404 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 10000 }
            ]
        },
        {
            name: 'Load Markers',
            url: 'https://api.chronas.org/v1/markers?year=2000&type=city',
            method: 'GET',
            critical: false,
            tests: [
                { name: 'Status code is 200 or 404', check: (response) => response.statusCode === 200 || response.statusCode === 404 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 8000 }
            ]
        },
        {
            name: 'Search Content',
            url: 'https://api.chronas.org/v1/metadata?search=rome&type=g&f=cities',
            method: 'GET',
            critical: false,
            tests: [
                { name: 'Status code is 200 or 404', check: (response) => response.statusCode === 200 || response.statusCode === 404 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 5000 }
            ]
        },
        {
            name: 'Discovery Content',
            url: 'https://api.chronas.org/v1/metadata?year=2000&type=i&end=10&discover=artefacts',
            method: 'GET',
            critical: false,
            tests: [
                { name: 'Status code is 200 or 404', check: (response) => response.statusCode === 200 || response.statusCode === 404 },
                { name: 'Response time is acceptable', check: (response, responseTime) => responseTime < 5000 }
            ]
        }
    ];
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    let criticalFailures = 0;
    
    // Execute each journey step
    for (const step of journeySteps) {
        await synthetics.executeStep(step.name.replace(/\\s+/g, '_'), async function () {
            log.info('Running journey step: ' + step.name);
            
            const startTime = Date.now();
            
            // Make HTTP request using Node.js https module
            const https = require('https');
            const url = require('url');
            
            const response = await new Promise((resolve, reject) => {
                const parsedUrl = url.parse(step.url);
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || 443,
                    path: parsedUrl.path,
                    method: step.method,
                    headers: {
                        'User-Agent': 'Chronas-Journey-Monitor'
                    }
                };
                
                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        resolve({
                            statusCode: res.statusCode,
                            responseBody: data,
                            headers: res.headers
                        });
                    });
                });
                
                req.on('error', (error) => {
                    reject(error);
                });
                
                req.setTimeout(15000, () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });
                
                req.end();
            });
            
            const responseTime = Date.now() - startTime;
            
            log.info(step.name + ' - Status: ' + response.statusCode + ', Time: ' + responseTime + 'ms');
            
            // Run all tests for this step
            let stepFailed = false;
            for (const test of step.tests) {
                totalTests++;
                try {
                    const passed = test.check(response, responseTime);
                    if (passed) {
                        passedTests++;
                        log.info('✓ ' + test.name);
                    } else {
                        failedTests++;
                        stepFailed = true;
                        log.error('✗ ' + test.name);
                    }
                } catch (error) {
                    failedTests++;
                    stepFailed = true;
                    log.error('✗ ' + test.name + ' - Error: ' + error.message);
                }
            }
            
            // Track critical failures
            if (stepFailed && step.critical) {
                criticalFailures++;
            }
        });
    }
    
    // Log summary
    log.info('User Journey Test Summary:');
    log.info('Total Tests: ' + totalTests);
    log.info('Passed: ' + passedTests);
    log.info('Failed: ' + failedTests);
    log.info('Critical Failures: ' + criticalFailures);
    
    if (criticalFailures > 0) {
        throw new Error('Critical user journey failures: ' + criticalFailures + ' critical steps failed');
    }
    
    if (failedTests > totalTests * 0.5) {
        throw new Error('Too many user journey failures: ' + failedTests + ' out of ' + totalTests + ' tests failed');
    }
    
    log.info('User journey simulation completed successfully');
};

exports.handler = async () => {
    return await synthetics.executeStep('userJourneyCheck', userJourneyCheck);
};
        `),
                handler: 'index.handler'
            }),
            runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_6_2,
            role: role,
            artifactsBucketLocation: { bucket: bucket },
            failureRetentionPeriod: cdk.Duration.days(7),
            successRetentionPeriod: cdk.Duration.days(7)
        });

        return canary;
    }

    private createPerformanceCanary(
        bucket: s3.IBucket,
        role: iam.IRole
    ): synthetics.Canary {
        const canary = new synthetics.Canary(this, 'PerformanceCanary', {
            canaryName: 'chronas-performance-test',
            schedule: synthetics.Schedule.rate(cdk.Duration.hours(1)),
            test: synthetics.Test.custom({
                code: synthetics.Code.fromInline(`
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const performanceCheck = async function () {
    log.info('Starting performance test');
    
    // Performance test - measure response times for critical endpoints - hardcoded URLs
    const performanceTests = [
        { name: 'Health Check', url: 'https://api.chronas.org/v1/health', maxTime: 1000 },
        { name: 'Version Check', url: 'https://api.chronas.org/v1/version', maxTime: 1000 },
        { name: 'Metadata Provinces', url: 'https://api.chronas.org/v1/metadata?type=g&f=provinces', maxTime: 5000 },
        { name: 'Areas 2000', url: 'https://api.chronas.org/v1/areas/2000', maxTime: 8000 },
        { name: 'Markers Cities', url: 'https://api.chronas.org/v1/markers?year=2000&type=city', maxTime: 5000 },
        { name: 'Statistics', url: 'https://api.chronas.org/v1/statistics', maxTime: 3000 }
    ];
    
    const performanceResults = [];
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    for (const test of performanceTests) {
        await synthetics.executeStep(test.name.replace(/\\s+/g, '_'), async function () {
            log.info('Running performance test: ' + test.name);
            
            const startTime = Date.now();
            
            // Make HTTP request using Node.js https module
            const https = require('https');
            const url = require('url');
            
            const response = await new Promise((resolve, reject) => {
                const parsedUrl = url.parse(test.url);
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || 443,
                    path: parsedUrl.path,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Chronas-Performance-Monitor'
                    }
                };
                
                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        resolve({
                            statusCode: res.statusCode,
                            responseBody: data,
                            headers: res.headers
                        });
                    });
                });
                
                req.on('error', (error) => {
                    reject(error);
                });
                
                req.setTimeout(15000, () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });
                
                req.end();
            });
            
            const responseTime = Date.now() - startTime;
            
            // Evaluate performance
            const withinSLA = responseTime <= test.maxTime;
            const serverError = response.statusCode >= 500;
            
            performanceResults.push({
                endpoint: test.name,
                responseTime: responseTime,
                status: response.statusCode,
                withinSLA: withinSLA,
                serverError: serverError
            });
            
            // Performance tests
            totalTests += 2; // Response time + server error check
            
            if (!serverError) {
                passedTests++;
                log.info('✓ ' + test.name + ' - No server error');
            } else {
                failedTests++;
                log.error('✗ ' + test.name + ' - Server error: ' + response.statusCode);
            }
            
            if (withinSLA) {
                passedTests++;
                log.info('✓ ' + test.name + ' - Within SLA: ' + responseTime + 'ms <= ' + test.maxTime + 'ms');
            } else {
                failedTests++;
                log.error('✗ ' + test.name + ' - SLA violation: ' + responseTime + 'ms > ' + test.maxTime + 'ms');
            }
            
            log.info(test.name + ' - Status: ' + response.statusCode + ', Time: ' + responseTime + 'ms');
        });
    }
    
    // Calculate performance metrics
    const avgResponseTime = performanceResults.reduce((sum, result) => sum + result.responseTime, 0) / performanceResults.length;
    const slaViolations = performanceResults.filter(result => !result.withinSLA).length;
    const serverErrors = performanceResults.filter(result => result.serverError).length;
    
    // Log performance summary
    log.info('Performance Test Summary:');
    log.info('Total Tests: ' + totalTests);
    log.info('Passed: ' + passedTests);
    log.info('Failed: ' + failedTests);
    log.info('Average response time: ' + Math.round(avgResponseTime) + 'ms');
    log.info('SLA violations: ' + slaViolations + '/' + performanceResults.length);
    log.info('Server errors: ' + serverErrors + '/' + performanceResults.length);
    
    // Fail if too many issues
    if (serverErrors > 0) {
        throw new Error('Server errors detected: ' + serverErrors + ' endpoints returned 5xx errors');
    }
    
    if (slaViolations > performanceResults.length * 0.4) {
        throw new Error('Too many SLA violations: ' + slaViolations + '/' + performanceResults.length + ' endpoints exceeded performance thresholds');
    }
    
    log.info('Performance test completed successfully');
};

exports.handler = async () => {
    return await synthetics.executeStep('performanceCheck', performanceCheck);
};
        `),
                handler: 'index.handler'
            }),
            runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_6_2,
            role: role,
            artifactsBucketLocation: { bucket: bucket },
            failureRetentionPeriod: cdk.Duration.days(7),
            successRetentionPeriod: cdk.Duration.days(7)
        });

        return canary;
    }

    private createCanaryAlarms() {
        this.canaries.forEach((canary, index) => {
            const alarm = new cloudwatch.Alarm(this, `CanaryAlarm${index}`, {
                alarmName: `${canary.canaryName}-failures`,
                alarmDescription: `Synthetic monitoring failures for ${canary.canaryName}`,
                metric: canary.metricFailed(),
                threshold: 1,
                evaluationPeriods: 1,
                comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD
            });

            alarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
        });
    }

    private createOutputs() {
        // SNS Topic ARN
        new cdk.CfnOutput(this, 'AlertTopicArn', {
            value: this.alertTopic.topicArn,
            description: 'SNS Topic ARN for synthetic monitoring alerts'
        });

        // Canaries count
        new cdk.CfnOutput(this, 'CanariesCount', {
            value: this.canaries.length.toString(),
            description: 'Number of synthetic monitoring canaries deployed'
        });

        // Canaries list
        new cdk.CfnOutput(this, 'CanariesList', {
            value: this.canaries.map(c => c.canaryName).join(', '),
            description: 'List of deployed canary names'
        });

        // CloudWatch Synthetics Console URL
        new cdk.CfnOutput(this, 'SyntheticsConsoleUrl', {
            value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#synthetics:canary/list`,
            description: 'CloudWatch Synthetics Console URL'
        });

        // Estimated monthly cost
        new cdk.CfnOutput(this, 'EstimatedMonthlyCost', {
            value: `$${(this.canaries.length * 0.0012 * 30 * 24 * 2).toFixed(2)} (based on canary run frequency)`,
            description: 'Estimated monthly cost for synthetic monitoring'
        });
    }
}