// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { sfnResume } from "../lib/sfnResume";
import * as events from "aws-cdk-lib/aws-events";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";

describe("SfnResume Construct - Integration Tests", () => {
	test("Can be integrated into a Step Functions workflow", () => {
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

		// Create a simple workflow that uses the resume task
		const definition = new sfn.Pass(stack, "Start")
			.next(resumeConstruct.task)
			.next(new sfn.Pass(stack, "AfterResume"));

		new sfn.StateMachine(stack, "TestStateMachine", {
			definition,
		});

		// THEN
		const template = Template.fromStack(stack);

		// Verify the state machine is created
		template.resourceCountIs("AWS::StepFunctions::StateMachine", 2); // Our test machine + the resume machine

		// Verify the state machine definition includes the task
		const resources = template.findResources(
			"AWS::StepFunctions::StateMachine",
		);

		// Find the test state machine (not the one from the construct)
		const testStateMachine = Object.values(resources).find(
			(resource) => !resource.Properties.StateMachineName,
		);

		// Check that the definition contains the task reference
		expect(testStateMachine).toBeDefined();
		expect(
			JSON.stringify(testStateMachine?.Properties?.DefinitionString),
		).toContain("updateDbResumeToken");
	});

	test("Accepts different JSON paths for IDs", () => {
		// GIVEN
		const app = new cdk.App();
		const stack = new cdk.Stack(app, "TestStack");

		// WHEN
		new sfnResume(stack, "TestSfnResume", {
			pathToIdPauseTask: "$.data.requestId",
			pathToIdWorkflow: "$.detail.requestId",
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			nameSuffix: "custom-paths",
			eventPattern: {
				source: ["test.source"],
			} as events.EventPattern,
		});

		// THEN
		const template = Template.fromStack(stack);

		// Get all state machines
		const resources = template.findResources(
			"AWS::StepFunctions::StateMachine",
		);

		// Find the resume state machine
		const resumeStateMachine = Object.values(resources).find(
			(resource) =>
				resource.Properties.StateMachineName === "TestStack_custom-paths",
		);

		// Check that the definition contains the custom path
		expect(resumeStateMachine).toBeDefined();
		expect(
			JSON.stringify(resumeStateMachine?.Properties?.DefinitionString),
		).toContain("$.detail.requestId");
	});
});
