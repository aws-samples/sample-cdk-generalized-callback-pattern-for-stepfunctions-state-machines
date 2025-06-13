// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import { NagSuppressions } from "cdk-nag";

import {
	aws_dynamodb as dynamodb,
	aws_stepfunctions as sfn,
	aws_stepfunctions_tasks as tasks,
	aws_events as events,
	aws_events_targets as targets,
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
export class sfnResume extends Construct {
	/**
	 * The task that should be implemented into the caller's workflow where they want to pause/resume execution.
	 * This task will store a resume token in DynamoDB and wait for a resume signal.
	 * When implemented, this task will pause the workflow until an event matching the configured pattern triggers the resume workflow.
	 */
	public readonly task: tasks.CallAwsService;

	constructor(scope: Construct, id: string, props: props) {
		super(scope, id);

		/**
		 * DynamoDB table that stores resume tokens1
		 * Uses id as the partition key and pay-per-request billing mode
		 * Removal policy is configurable via props
		 */
		const table = new dynamodb.Table(this, "table", {
			partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
			billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
			removalPolicy: props.removalPolicy,
		});

		/**
		 * Creates a DynamoDB PutItem task that stores a Step Functions task token
		 * @param {string} table.tableName - The name of the DynamoDB table to update 
		 * @param {string} props.pathToIdPauseTask - JSON path to the ID used as partition key
		 * @param {string} sfn.JsonPath.taskToken - The task token to store in the table
		 * @returns {tasks.CallAwsService} A Step Functions task that updates DynamoDB
		 */
		this.task = new tasks.CallAwsService(this, "putDbResumeToken", {
			resultPath: sfn.JsonPath.DISCARD,
			service: "dynamodb",
			action: "putItem",
			integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
			parameters: {
				TableName: table.tableName,
				Item: {
					id: { "S.$": props.pathToIdPauseTask },
					token: { S: sfn.JsonPath.taskToken }
				},
				ConditionExpression: "attribute_not_exists(id)"
			},
			iamResources: [table.tableArn],
		});

		/**
		 * Creates a DynamoDB GetItem task to retrieve a resume token
		 * @param {string} resultPath - Path where the result will be stored in state data
		 * @param {Object} key - Key to identify the item to retrieve
		 * @param {string} props.pathToIdWorkflow - JSON path to the ID used as partition key
		 * @param {dynamodb.Table} table - DynamoDB table to query
		 */
		const getResumeToken = new tasks.DynamoGetItem(this, "getResumeToken", {
			resultPath: "$.getResumeToken",
			key: {
				id: tasks.DynamoAttributeValue.fromString(
					sfn.JsonPath.stringAt(props.pathToIdWorkflow),
				),
			},
			table: table,
		});

		/**
		 * Creates a Step Functions SendTaskSuccess task
		 * Sends a success signal to a paused workflow using the stored task token
		 *
		 * @param {string} resultPath - Path where the result will be stored in state data
		 * @param {string} service - AWS service to call (sfn)
		 * @param {string} action - API action to call (sendTaskSuccess)
		 * @param {Object} parameters - Task parameters including:
		 *   - TaskToken: Retrieved from DynamoDB table
		 *   - Output: Status message to pass back
		 * @param {string[]} iamResources - IAM resources that can be accessed
		 */
		const sendTaskSuccess = new tasks.CallAwsService(this, "sendTaskSuccess", {
			resultPath: "$.sendTaskSuccess",
			service: "sfn",
			action: "sendTaskSuccess",
			parameters: {
				TaskToken: sfn.JsonPath.stringAt("$.getResumeToken.Item.token.S"),
				Output: {
					staus: "resume",
				},
			},
			iamResources: [
				`arn:aws:states:${cdk.Stack.of(this).region}:${
					cdk.Stack.of(this).account
				}:*`,
			],
		});

		/**
		 * Creates a DynamoDB DeleteItem task to remove a resume token entry
		 * @param {string} props.pathToIdWorkflow - JSON path to the ID used as partition key
		 * @param {dynamodb.Table} table - DynamoDB table to delete from
		 * @returns {tasks.DynamoDeleteItem} A Step Functions task that deletes from DynamoDB
		 */
		const deleteResumeToken = new tasks.DynamoDeleteItem(
			this,
			"deleteResumeToken",
			{
				key: {
					id: tasks.DynamoAttributeValue.fromString(
						sfn.JsonPath.stringAt(props.pathToIdWorkflow),
					),
				},
				table: table,
			},
		);

		/**
		 * Create a dedicated IAM role for the Step Function
		 * with permissions to access DynamoDB and send task success signals
		 */
		const sfnRole =
			props.role ||
			new iam.Role(this, "ResumeWorkflowRole", {
				assumedBy: new iam.ServicePrincipal("states.amazonaws.com"),
				description: "Role for the Step Functions Resume Workflow",
			});

		// Grant DynamoDB permissions if using the default role
		if (!props.role) {
			table.grantReadWriteData(sfnRole);

			// // Grant Step Functions permissions to send task success as inline policy
			// const sendTaskSuccessPolicy = new iam.Policy(
			// 	this,
			// 	"SendTaskSuccessPolicy",
			// 	{
			// 		statements: [
			// 			new iam.PolicyStatement({
			// 				actions: ["states:SendTaskSuccess"],
			// 				resources: [
			// 					`arn:aws:states:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*`,
			// 				],
			// 			}),
			// 		],
			// 	},
			// );
			// sfnRole.attachInlinePolicy(sendTaskSuccessPolicy);
		}

		/**
		 * Creates a Step Functions state machine that handles workflow resumption
		 * The state machine executes the following steps in sequence:
		 * 1. Retrieves a resume token from DynamoDB
		 * 2. Sends a success signal to the paused workflow
		 * 3. Deletes the resume token from DynamoDB
		 *
		 * @param {string} props.nameSuffix - Suffix to append to state machine name
		 * @param {string} cdk.Stack.of(this).stackName - Stack name prefix for state machine
		 * @param {sfn.IChainable} definition - State machine workflow definition
		 * @param {cdk.RemovalPolicy} props.removalPolicy - Policy for resource removal
		 */
		const sfnMain = new sfn.StateMachine(this, `${props.nameSuffix}`, {
			stateMachineName: `${cdk.Stack.of(this).stackName}_${props.nameSuffix}`,
			definition: getResumeToken.next(sendTaskSuccess).next(deleteResumeToken),
			removalPolicy: props.removalPolicy,
			logs: {
				destination: new cdk.aws_logs.LogGroup(this, `${cdk.Stack.of(this).stackName}_${props.nameSuffix}_logs`, {
					logGroupName: `/aws/vendedlogs/states/${cdk.Stack.of(this).stackName}/${props.nameSuffix}`,
					removalPolicy: props.removalPolicy,
				}),
				level: sfn.LogLevel.ALL,
			},
			tracingEnabled: true,
			role: sfnRole,
		});

		NagSuppressions.addResourceSuppressions(
			sfnRole,
			[
				{
					id: "AwsSolutions-IAM5",
					reason: "SendTaskSuccess API requires wildcard permissions as granular resource permissions for task tokens is not supported.",
					appliesTo: [
						"Resource::arn:aws:states:<AWS::Region>:<AWS::AccountId>:*",
					],
				},
				{
					id: "AwsSolutions-IAM5",
					reason: "CDK automatically adds these permissions for CloudWatch Logs integration. Actions are limited to specific logging operations",
					appliesTo: [
						"Action::logs:CreateLogDelivery",
						"Action::logs:GetLogDelivery",
						"Action::logs:UpdateLogDelivery",
						"Action::logs:DeleteLogDelivery",
						"Action::logs:ListLogDeliveries",
						"Action::logs:PutResourcePolicy",
						"Action::logs:DescribeResourcePolicies",
						"Action::logs:DescribeLogGroups",
						"Resource::*",
					],
				},
				{
					id: "AwsSolutions-IAM5",
					reason: "CDK automatically adds these permissions for CloudWatch Logs integration. Actions are limited to specific logging operations",
					appliesTo: [
						"Action::xray:PutTraceSegments",
						"Action::xray:PutTelemetryRecords",
						"Action::xray:GetSamplingRules",
						"Action::xray:GetSamplingTarget",
						"Resource::*",
					],
				},
			],
			true,
		);

		/**
		 * Creates an EventBridge rule that triggers the resume workflow
		 * @param {string} props.nameSuffix - Suffix used in rule description
		 * @param {events.EventPattern} props.eventPattern - Pattern that determines when rule is triggered
		 * @returns {events.Rule} An EventBridge rule that can trigger the state machine
		 */
		const eventRule = new events.Rule(this, "resumeRule", {
			description: `${props.nameSuffix} sfnResume`,
			eventPattern: props.eventPattern,
		});

		eventRule.addTarget(new targets.SfnStateMachine(sfnMain));
		// END
	}
}
