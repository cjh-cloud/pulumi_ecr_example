
import * as aws from "@pulumi/aws";
import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";

const customImage = "my-image"; // name of the pulumi resource
const imageVersion = process.env.VERSION; // created in pipeline by semantic release

const repo = new aws.ecr.Repository("my-repo"); // Create a private ECR repository.
const imageName = repo.repositoryUrl; // Get registry info (creds and endpoint)

// Build and publish the container image.
let image = null;
if (process.env.VERSION) {
    image = new docker.Image(customImage, {
        build: "app",
        imageName: pulumi.interpolate`${imageName}:${imageVersion}`,
    });
}

// Export the base and specific version image name.
export const baseImageName = image == null ? null : image.baseImageName;
export const fullImageName = image == null ? null : image.imageName;

//* Deploy the image to Fargate...

import * as awsx from "@pulumi/awsx";

const DOMAIN = ''; // TODO : domain name
const PORT = 8080;

// Allocate a new VPC with the default settings:
const vpc = new awsx.ec2.Vpc("custom", {});

// Export a few resulting fields to make them easy to use:
export const vpcId = vpc.id;
export const vpcPrivateSubnetIds = vpc.privateSubnetIds;
export const vpcPublicSubnetIds = vpc.publicSubnetIds;

// SSL Certificate
const exampleCertificate = new aws.acm.Certificate("cert", {
    domainName: `dev.${DOMAIN}`,
    tags: {
        Environment: "dev",
    },
    validationMethod: "DNS",
});

const hostedZoneId = aws.route53.getZone({ name: DOMAIN }, { async: true }).then(zone => zone.zoneId);

// DNS records to verify SSL Certificate
const certificateValidationDomain = new aws.route53.Record(`dev.${DOMAIN}-validation`, {
    name: exampleCertificate.domainValidationOptions[0].resourceRecordName,
    zoneId: hostedZoneId,
    type: exampleCertificate.domainValidationOptions[0].resourceRecordType,
    records: [exampleCertificate.domainValidationOptions[0].resourceRecordValue],
    ttl: 600,
});

const certificateValidation = new aws.acm.CertificateValidation("certificateValidation", {
    certificateArn: exampleCertificate.arn,
    validationRecordFqdns: [certificateValidationDomain.fqdn],
});

// Creates an ALB associated with our custom VPC.
const alb = new awsx.lb.ApplicationLoadBalancer(`${customImage}-service`, { vpc });

// Listen to HTTP traffic on port 80 and redirect to 443
const httpListener = alb.createListener("web-listener", { 
    port: 80,
    protocol: "HTTP",
    defaultAction: {
        type: "redirect",
        redirect: {
            protocol: "HTTPS",
            port: "443",
            statusCode: "HTTP_301",
        },
    },
});
const target = alb.createTargetGroup("web-target", { vpc, port: PORT }); // Target group with the port of the Docker image
const httpsListener = target.createListener("web-listener", {
    port: 443,
    certificateArn: certificateValidation.certificateArn
}); // Listen to traffic on port 443 and route it through the target group.

// Create a DNS record for the load balancer
const albDomain = new aws.route53.Record(`dev.${DOMAIN}`, {
    name: `dev.${DOMAIN}`,
    zoneId: hostedZoneId,
    type: "CNAME",
    records: [httpsListener.endpoint.hostname],
    ttl: 600,
});

// Fargate Cluster
const cluster = new awsx.ecs.Cluster(`${customImage}-cluster`, { vpc });

const service = new awsx.ecs.FargateService(`${customImage}-service`, {
    cluster,
    desiredCount: 1,
    taskDefinitionArgs: {
        containers: {
            app: {
                image: pulumi.interpolate`${imageName}:${imageVersion}`,
                memory: 512,
                portMappings: [httpsListener],
            },
        },
    },
});

// Export the URL so we can easily access it.
export const frontendURL = pulumi.interpolate `https://dev.${DOMAIN}/`;