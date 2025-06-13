// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import {
	aws_stepfunctions_tasks as tasks,
	aws_events as events,
	aws_iam as iam,
} from "aws-cdk-lib";
export interface props {
	pathToIdPauseTask: string;
	pathToIdWorkflow: string;
	removalPolicy: cdk.RemovalPolicy;
	nameSuffix: string;
	eventPattern: events.EventPattern;
	role?: iam.IRole;
}
/**
 * Class that implements a workflow resume mechanism using AWS Step Functions
 * Extends the Construct class to create AWS CDK infrastructure
 * Exposes a task property that represents an AWS service call
 */
export declare class sfnResume extends Construct {
	/**
	 * The task that should be implemented into the caller's workflow where they want to pause/resume execution.
	 * This task will store a resume token in DynamoDB and wait for a resume signal.
	 * When implemented, this task will pause the workflow until an event matching the configured pattern triggers the resume workflow.
	 */
	readonly task: tasks.CallAwsService;
	constructor(scope: Construct, id: string, props: props);
}
