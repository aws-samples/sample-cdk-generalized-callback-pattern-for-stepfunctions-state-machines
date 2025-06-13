// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { sfnResume } from "../lib/sfnResume";
import * as events from "aws-cdk-lib/aws-events";

describe("SfnResume Construct - DynamoDB Resources", () => {
	test("Creates DynamoDB table with correct configuration", () => {
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

		// Verify DynamoDB table is created with correct configuration
		template.hasResourceProperties("AWS::DynamoDB::Table", {
			KeySchema: [
				{
					AttributeName: "id",
					KeyType: "HASH",
				},
			],
			AttributeDefinitions: [
				{
					AttributeName: "id",
					AttributeType: "S",
				},
			],
			BillingMode: "PAY_PER_REQUEST",
		});

		// Verify the table has the correct removal policy
		template.hasResource("AWS::DynamoDB::Table", {
			DeletionPolicy: "Delete",
			UpdateReplacePolicy: "Delete",
		});
	});
});
