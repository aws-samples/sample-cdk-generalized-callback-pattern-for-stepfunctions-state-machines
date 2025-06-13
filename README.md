# AWS Step Functions Workflow Resume Mechanism

The sfnResume construct provides a mechanism for resuming AWS Step Functions workflows using Amazon DynamoDB for state persistence and Amazon EventBridge for triggering resumption. This enables long-running workflows to be paused and resumed based on events.

The construct creates a complete infrastructure stack including a DynamoDB table for storing resume tokens, a Step Functions state machine to handle the resume process, and an EventBridge rule to trigger workflow resumption. It exposes a configurable task that can be integrated into existing Step Functions workflows to implement pause/resume functionality at any point in the workflow execution.

This construct is intended to be deployed with an independent resume Step Function state machine and DynamoDB table per application Step Function workflow. By default an instantiation of this construct will provide these independent resources. You should instantiate a new instance of this construct per use of this pattern in you application Step Function workflows. E.g. if your workflow waits for service X and later service Y, this construct should be instantiated twice, once for service X and once for service Y.

## Usage Instructions

### Quick Start

1. Import the construct in your CDK stack:

```typescript
import { sfnResume } from "sfnResume";
```

2. Create an instance of the resume workflow construct:

```typescript
const sfnResume = new sfnResume(this, "sfnResume", {
	pathToIdPauseTask: "$.createTranslationJob.JobId",
	removalPolicy: props.removalPolicy,
	nameSuffix: "TranslationTranslateResume",
	pathToIdWorkflow: "$.detail.jobId",
	eventPattern: {
		source: ["aws.translate"],
		detailType: ["Translate TextTranslationJob State Change"],
		detail: {
			jobStatus: ["COMPLETED"],
		},
	},
});
```

3. Integrate the pause task into your workflow:

```typescript
const workflow = new sfn.StateMachine(this, "MyWorkflow", {
	definition: sfn.Chain.start(someTask).next(sfnResume.task).next(nextTask),
});
```

## Reference

### sfnResume Props

| Property          | Type                | Description                                                                                                                                         |
| ----------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| eventPattern      | events.EventPattern | EventBridge pattern that matches the service's task/job completion event to trigger workflow resumption                                             |
| nameSuffix        | string              | Suffix to append to resource names                                                                                                                  |
| pathToIdPauseTask | string              | JSON path to the unique job ID returned from the service start in the apps stepfunction. This ID is used to store the corresponding task token      |
| pathToIdWorkflow  | string              | JSON path to the unique job ID in the EventBridge event that we're waiting for completion. This ID is used to retrieve the corresponding task token |
| removalPolicy     | cdk.RemovalPolicy   | Policy for resource removal                                                                                                                         |

## Data Flow

The workflow resume mechanism orchestrates the pause and resume process through a series of coordinated steps involving DynamoDB for state persistence and Step Functions for workflow control.

Key Component Interactions:

1. Workflow execution reaches pause task and stores task token in DynamoDB with the services job ID as the primary key.
2. EventBridge rule monitors for resume trigger events
3. Resume state machine retrieves task token from DynamoDB using a the job ID from the event payload
4. SendTaskSuccess API call resumes the paused workflow
5. DynamoDB entry is cleaned up after successful resume

## Infrastructure

### DynamoDB

- Table: Resume token storage
  - Partition Key: id (String)
  - Billing Mode: PAY_PER_REQUEST

### Step Functions

- State Machine: Resume workflow orchestrator
  - Tasks: GetItem, SendTaskSuccess, DeleteItem
  - IAM Role: Permissions for DynamoDB and Step Functions APIs

### EventBridge

- Rule: Resume trigger
  - Target: Resume state machine
  - Pattern: Configurable via props
