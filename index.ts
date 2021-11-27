
import * as aws from "@pulumi/aws";
import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";

// Create a private ECR repository.
const repo = new aws.ecr.Repository("my-repo");

// Get registry info (creds and endpoint)
const imageName = repo.repositoryUrl;

const customImage = "my-image"; // name of the pulumi resource
const imageVersion = process.env.VERSION; // created in pipeline by semantic release

// Build and publish the container image.
const image = new docker.Image(customImage, {
	build: "app",
	imageName: pulumi.interpolate`${imageName}:${imageVersion}`,
});

// Export the base and specific version image name.
export const baseImageName = image.baseImageName;
export const fullImageName = image.imageName;
