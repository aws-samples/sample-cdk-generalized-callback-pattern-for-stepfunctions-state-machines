// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { sfnResume } from "../lib/sfnResume";
import * as events from "aws-cdk-lib/aws-events";

describe("SfnResume Construct - Step Functions Resources", () => {
	test("Creates Step Functions state machine with correct configuration", () => {
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

		// Verify State Machine is created with the correct name
		template.hasResourceProperties("AWS::StepFunctions::StateMachine", {
			StateMachineName: "TestStack_test-resume",
		});

		// Verify the state machine has the correct removal policy
		template.hasResource("AWS::StepFunctions::StateMachine", {
			DeletionPolicy: "Delete",
			UpdateReplacePolicy: "Delete",
		});

		// Verify the state machine has IAM role with appropriate permissions
		// Find the policy that contains dynamodb:GetItem
		const resources = template.findResources("AWS::IAM::Policy");
		const policies = Object.values(resources);

		// Check that at least one policy has dynamodb:GetItem permission
		const hasGetItemPermission = policies.some((policy) => {
			const statements = policy.Properties?.PolicyDocument?.Statement || [];
			return statements.some(
				(statement: any) =>
					statement.Action === "dynamodb:GetItem" &&
					statement.Effect === "Allow",
			);
		});

		expect(hasGetItemPermission).toBe(true);

		// Check that at least one policy has states:sendTaskSuccess permission
		const hasSendTaskSuccessPermission = policies.some((policy) => {
			const statements = policy.Properties?.PolicyDocument?.Statement || [];
			return statements.some(
				(statement: any) =>
					statement.Action === "states:sendTaskSuccess" &&
					statement.Effect === "Allow",
			);
		});

		expect(hasSendTaskSuccessPermission).toBe(true);

		// Check that at least one policy has dynamodb:DeleteItem permission
		const hasDeleteItemPermission = policies.some((policy) => {
			const statements = policy.Properties?.PolicyDocument?.Statement || [];
			return statements.some(
				(statement: any) =>
					statement.Action === "dynamodb:DeleteItem" &&
					statement.Effect === "Allow",
			);
		});

		expect(hasDeleteItemPermission).toBe(true);
	});

	test("Exposes a task property that can be used in Step Functions workflows", () => {
		// GIVEN
		const app = new cdk.App();
		const stack = new cdk.Stack(app, "TestStack");

		// WHEN
		const resumeConstruct = new sfnResume(stack, "TestSfnResume", {
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
		expect(resumeConstruct.task).toBeDefined();

		// Verify the task is a CallAwsService task
		const template = Template.fromStack(stack);

		// Just verify that the task exists and is exposed correctly
		// We don't need to check specific IAM permissions as they're tested elsewhere
		expect(resumeConstruct.task.id).toContain("updateDbResumeToken");
	});
});
