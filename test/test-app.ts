#!/usr/bin/env node

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { sfnResume } from "../lib/sfnResume";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import { Aspects } from "aws-cdk-lib";

class TestStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		// Create an instance of the sfnResume construct
		const resumeConstruct = new sfnResume(this, "TestSfnResume", {
			pathToIdPauseTask: "$.id",
			pathToIdWorkflow: "$.id",
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			nameSuffix: "test-resume",
			eventPattern: {
				source: ["test-source"],
				detailType: ["test-detail-type"],
			},
		});
	}
}

// Create app and stack
const app = new cdk.App();
const stack = new TestStack(app, "TestSfnResumeStack");

// Add CDK-NAG checks
Aspects.of(app).add(new AwsSolutionsChecks());

app.synth();
