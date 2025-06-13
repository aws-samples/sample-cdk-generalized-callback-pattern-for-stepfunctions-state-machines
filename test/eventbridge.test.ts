// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { sfnResume } from "../lib/sfnResume";
import * as events from "aws-cdk-lib/aws-events";

describe("SfnResume Construct - EventBridge Resources", () => {
	test("Creates EventBridge rule with correct configuration", () => {
		// GIVEN
		const app = new cdk.App();
		const stack = new cdk.Stack(app, "TestStack");

		// WHEN
		new sfnResume(stack, "TestSfnResume", {
			pathToIdPauseTask: "$.id",
			pathToIdWorkflow: "$.id",
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			nameSuffix: "test-resume",
			eventPattern: {
				source: ["test.source"],
				detailType: ["test.event"],
			} as events.EventPattern,
		});

		// THEN
		const template = Template.fromStack(stack);

		// Verify EventBridge rule is created with correct pattern
		template.hasResourceProperties("AWS::Events::Rule", {
			Description: "test-resume sfnResume",
			EventPattern: {
				source: ["test.source"],
				"detail-type": ["test.event"],
			},
		});

		// Verify the rule targets the state machine
		template.hasResourceProperties("AWS::Events::Rule", {
			Targets: [
				{
					Arn: Match.anyValue(),
					Id: Match.anyValue(),
				},
			],
		});
	});

	test("Accepts custom event patterns", () => {
		// GIVEN
		const app = new cdk.App();
		const stack = new cdk.Stack(app, "TestStack");

		// WHEN
		new sfnResume(stack, "TestSfnResume", {
			pathToIdPauseTask: "$.id",
			pathToIdWorkflow: "$.id",
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			nameSuffix: "test-resume",
			eventPattern: {
				source: ["custom.source"],
				detailType: ["custom.event"],
				detail: {
					status: ["COMPLETED"],
				},
			} as events.EventPattern,
		});

		// THEN
		const template = Template.fromStack(stack);

		// Verify EventBridge rule has the custom pattern
		template.hasResourceProperties("AWS::Events::Rule", {
			EventPattern: {
				source: ["custom.source"],
				"detail-type": ["custom.event"],
				detail: {
					status: ["COMPLETED"],
				},
			},
		});
	});
});
