
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";

// Allocate a new VPC with the default settings:
const vpc = new awsx.ec2.Vpc("custom", {});

// Export a few resulting fields to make them easy to use:
export const vpcId = vpc.id;
export const vpcPrivateSubnetIds = vpc.privateSubnetIds;
export const vpcPublicSubnetIds = vpc.publicSubnetIds;

// Create a private ECR repository.
const repo = new aws.ecr.Repository("my-repo");

// Get registry info (creds and endpoint)
const imageName = repo.repositoryUrl;

const customImage = "my-image"; // name of the pulumi resource
const imageVersion = process.env.VERSION; // created in pipeline by semantic release

//!
// Create a load balancer to listen for requests and route them to the container.
const listener = new awsx.elasticloadbalancingv2.NetworkListener(`${customImage}-service`, { port: 8080 });

// Fargate Cluster
const cluster = new awsx.ecs.Cluster(`${customImage}-cluster`, { vpc });

const service = new awsx.ecs.FargateService(`${customImage}-service`, {
    desiredCount: 1,
    taskDefinitionArgs: {
        containers: {
            app: {
                image: pulumi.interpolate`${imageName}:${imageVersion}`,
                memory: 512,
                portMappings: [listener],
            },
        },
    },
});

// Export the URL so we can easily access it.
export const frontendURL = pulumi.interpolate `http://${listener.endpoint.hostname}/`;
// !

// TODO : check version is not undefined
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