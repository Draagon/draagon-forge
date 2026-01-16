# REQ-039: Async & Message Pattern Extraction

**Status:** Draft
**Priority:** P1
**Created:** 2026-01-15
**Author:** Doug / Claude
**Depends On:** REQ-033 (Code Knowledge Mesh), REQ-034 (Extraction Context Provider)
**Layer:** L3 (draagon-forge) - Programming-specific

---

## Summary

Extract semantic knowledge from asynchronous patterns, message queues, event buses, and distributed communication. Enable the Code Knowledge Mesh to understand not just "what functions exist" but "how data flows asynchronously through the system, what queues connect services, and how events propagate across boundaries."

**Key Capabilities:**
- **Queue Producer/Consumer Mapping**: SQS, RabbitMQ, Kafka producer/consumer relationships
- **Message Schema Extraction**: Event payloads, message contracts
- **Event Bus Patterns**: Domain events, integration events, pub/sub
- **Retry & Dead-Letter Detection**: Error handling, retry policies
- **Transaction Boundaries**: Distributed transaction patterns (saga, outbox)
- **Async Flow Tracing**: Promise chains, Observable streams, async/await patterns

---

## Problem Statement

### Why Async Pattern Extraction Matters

Modern systems are distributed and event-driven. Understanding async flows enables:

```typescript
// What structural extraction sees:
// - Method: processPayment()
// - Call: sqsClient.send()
// - Import: @aws-sdk/client-sqs

// What we NEED to understand:
// - This publishes to 'payment-events' queue
// - Message schema: { orderId, amount, currency, timestamp }
// - Consumer: PaymentWorker in billing-service repo
// - Retry policy: 3 retries with exponential backoff
// - Dead letter queue: 'payment-events-dlq'
// - Part of OrderProcessing saga
// - If this fails, inventory reservation should rollback
```

### The Distributed System Problem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  ASYNC COMMUNICATION LANDSCAPE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────────────────┐   │
│  │  Order        │    │   Payment     │    │   Shipping                │   │
│  │  Service      │───►│   Queue       │───►│   Service                 │   │
│  │  (Producer)   │    │   (SQS)       │    │   (Consumer)              │   │
│  └───────────────┘    └───────────────┘    └───────────────────────────┘   │
│         │                                            │                      │
│         │              ┌───────────────┐             │                      │
│         └─────────────►│  Event Bus    │◄────────────┘                      │
│                        │  (EventBridge)│                                    │
│                        └───────┬───────┘                                    │
│                                │                                            │
│          ┌────────────────┬────┴────┬────────────────┐                     │
│          ▼                ▼         ▼                ▼                     │
│   ┌────────────┐  ┌────────────┐ ┌────────────┐ ┌────────────┐            │
│   │ Analytics  │  │ Inventory  │ │ Notification│ │  Audit     │            │
│   │ Service    │  │ Service    │ │ Service    │ │  Service   │            │
│   └────────────┘  └────────────┘ └────────────┘ └────────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Questions We Can't Answer Today

- What service consumes messages from the `orders` queue?
- If the `PaymentProcessed` event fails, what happens?
- What's the message schema for `inventory-updates` topic?
- Which queues have dead-letter queues configured?
- What's the end-to-end flow when a user places an order?
- Are there any circular event dependencies?

---

## Solution Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    ASYNC PATTERN EXTRACTION                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    TECHNOLOGY DETECTION                                  │   │
│  │   SQS | RabbitMQ | Kafka | Redis | EventBridge | NATS | BullMQ          │   │
│  └──────────────────────────────────┬──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │               TECHNOLOGY-SPECIFIC EXTRACTORS                             │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │   │
│  │  │    AWS      │ │  RabbitMQ   │ │   Kafka     │ │     BullMQ      │   │   │
│  │  │  (SQS/SNS)  │ │  Extractor  │ │  Extractor  │ │    Extractor    │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘   │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                    ASYNC GRAPH NODES                                     │   │
│  │  Queue | Topic | Producer | Consumer | Message | Saga | RetryPolicy     │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                    RELATIONSHIP EDGES                                    │   │
│  │  PUBLISHES_TO | CONSUMES_FROM | TRIGGERS | COMPENSATES | DEAD_LETTERS   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Graph Schema - Async Nodes

### R1: Queue/Topic Nodes

**R1.1: Queue Node Type**

```typescript
interface QueueNode {
  type: 'Queue';
  name: string;
  file: string;  // Where first referenced
  line: number;

  // Technology
  technology: 'sqs' | 'rabbitmq' | 'kafka' | 'redis' | 'bullmq' | 'nats' | 'azure_servicebus';

  // Queue type
  queue_type: 'standard' | 'fifo' | 'priority' | 'delay';

  // Configuration
  config: {
    visibility_timeout?: number;
    message_retention?: number;
    max_message_size?: number;
    delay_seconds?: number;
  };

  // Dead letter
  has_dlq: boolean;
  dlq_name?: string;
  max_receive_count?: number;

  // URL/ARN
  queue_url?: string;
  queue_arn?: string;

  // Cross-repo tracking
  defined_in_repo?: string;
}
```

**R1.2: Topic Node Type**

```typescript
interface TopicNode {
  type: 'Topic';
  name: string;
  file: string;
  line: number;

  // Technology
  technology: 'sns' | 'kafka' | 'rabbitmq_exchange' | 'eventbridge' | 'nats' | 'redis_pubsub';

  // Topic type
  topic_type: 'standard' | 'fifo' | 'fanout' | 'direct' | 'topic';

  // Partitioning (Kafka)
  partitions?: number;
  replication_factor?: number;

  // Routing
  routing_key_pattern?: string;

  // Subscriptions
  subscriptions: Array<{
    name: string;
    filter?: string;
    endpoint: string;
  }>;
}
```

**R1.3: MessageSchema Node Type**

```typescript
interface MessageSchemaNode {
  type: 'MessageSchema';
  name: string;
  file: string;
  line: number;

  // Schema definition
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;

  // Metadata fields
  has_correlation_id: boolean;
  has_timestamp: boolean;
  has_version: boolean;

  // Schema evolution
  version?: string;
  backward_compatible?: boolean;
  deprecated_fields?: string[];

  // Serialization
  format: 'json' | 'avro' | 'protobuf' | 'messagepack';
}
```

### R2: Producer/Consumer Nodes

**R2.1: Producer Node Type**

```typescript
interface ProducerNode {
  type: 'Producer';
  name: string;  // Class/function name
  file: string;
  line: number;

  // Target
  target_type: 'queue' | 'topic' | 'exchange';
  target_name: string;

  // Production pattern
  pattern: 'direct' | 'fanout' | 'routing_key' | 'partition';
  routing_key?: string;
  partition_key?: string;

  // Message
  message_schema?: string;  // Reference to MessageSchema

  // Reliability
  delivery_guarantee: 'at_most_once' | 'at_least_once' | 'exactly_once';
  uses_transactions: boolean;
  uses_outbox_pattern: boolean;

  // Batching
  batches_messages: boolean;
  batch_size?: number;
}
```

**R2.2: Consumer Node Type**

```typescript
interface ConsumerNode {
  type: 'Consumer';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Source
  source_type: 'queue' | 'topic' | 'subscription';
  source_name: string;

  // Handler
  handler_function: string;

  // Processing
  concurrency: number;
  batch_processing: boolean;
  batch_size?: number;

  // Acknowledgment
  ack_mode: 'auto' | 'manual' | 'client';
  ack_timeout?: number;

  // Retry policy
  retry_policy?: {
    max_retries: number;
    backoff: 'fixed' | 'exponential' | 'linear';
    initial_delay_ms: number;
    max_delay_ms?: number;
  };

  // Dead letter handling
  on_failure: 'dlq' | 'discard' | 'retry_indefinitely' | 'requeue';

  // Filtering
  message_filter?: string;  // Selector/filter expression
}
```

### R3: Event Bus Nodes

**R3.1: EventBus Node Type**

```typescript
interface EventBusNode {
  type: 'EventBus';
  name: string;
  file: string;
  line: number;

  // Bus type
  bus_type: 'in_process' | 'distributed' | 'hybrid';
  technology?: 'eventbridge' | 'nestjs_cqrs' | 'mediatr' | 'custom';

  // Scope
  scope: 'domain' | 'integration' | 'both';

  // Configuration
  async_dispatch: boolean;
  guaranteed_delivery: boolean;
}
```

**R3.2: EventHandler Node Type**

```typescript
interface EventHandlerNode {
  type: 'EventHandler';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Handles
  handles_events: string[];  // Event types

  // Execution
  is_async: boolean;
  is_saga: boolean;
  timeout_ms?: number;

  // Error handling
  on_error: 'throw' | 'log' | 'retry' | 'compensate';
  compensation_action?: string;

  // Idempotency
  idempotent: boolean;
  idempotency_key?: string;
}
```

### R4: Saga/Workflow Nodes

**R4.1: Saga Node Type**

```typescript
interface SagaNode {
  type: 'Saga';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Saga type
  saga_type: 'orchestration' | 'choreography';

  // Steps
  steps: Array<{
    name: string;
    order: number;
    action: string;  // Command/event
    compensation: string;  // Rollback action
    timeout_ms?: number;
    retry_policy?: {
      max_retries: number;
      backoff: string;
    };
  }>;

  // Triggers
  triggered_by: string;  // Starting event/command
  completion_event?: string;
  failure_event?: string;

  // State
  persists_state: boolean;
  state_store?: string;
}
```

**R4.2: OutboxPattern Node Type**

```typescript
interface OutboxPatternNode {
  type: 'OutboxPattern';
  name: string;
  file: string;
  line: number;

  // Outbox table
  outbox_table: string;
  database: string;

  // Publishing
  publisher_service: string;
  publish_interval_ms: number;

  // Schema
  message_schema: Array<{
    column: string;
    type: string;
    purpose: 'id' | 'payload' | 'destination' | 'created_at' | 'processed_at' | 'status';
  }>;

  // Cleanup
  retention_days?: number;
}
```

### R5: Async Pattern Nodes

**R5.1: PromiseChain Node Type**

```typescript
interface PromiseChainNode {
  type: 'PromiseChain';
  function_name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Chain structure
  steps: Array<{
    order: number;
    type: 'then' | 'catch' | 'finally' | 'await';
    expression: string;
    calls_async: string[];  // Other async functions called
  }>;

  // Error handling
  has_catch: boolean;
  catch_rethrows: boolean;
  has_finally: boolean;

  // Concurrency patterns
  uses_promise_all: boolean;
  uses_promise_race: boolean;
  uses_promise_allSettled: boolean;
  parallel_branches?: number;
}
```

**R5.2: ObservableStream Node Type**

```typescript
interface ObservableStreamNode {
  type: 'ObservableStream';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Source
  source_type: 'subject' | 'http' | 'event' | 'interval' | 'fromPromise' | 'custom';

  // Operators
  operators: Array<{
    name: string;
    order: number;
    purpose: 'transform' | 'filter' | 'combine' | 'error' | 'utility';
    config?: Record<string, unknown>;
  }>;

  // Subscription
  subscription_count: number;
  has_unsubscribe: boolean;

  // Hot/Cold
  is_hot: boolean;
  is_multicasted: boolean;
}
```

---

## Part 2: Graph Schema - Async Edges

### R6: Relationship Types

**R6.1: PUBLISHES_TO Edge**

```typescript
interface PublishesToEdge {
  type: 'PUBLISHES_TO';
  from: ProducerNode | FunctionNode;
  to: QueueNode | TopicNode;

  message_schema?: string;
  routing_key?: string;
  condition?: string;  // When published
}
```

**R6.2: CONSUMES_FROM Edge**

```typescript
interface ConsumesFromEdge {
  type: 'CONSUMES_FROM';
  from: ConsumerNode;
  to: QueueNode | TopicNode;

  filter?: string;
  consumer_group?: string;  // Kafka
}
```

**R6.3: TRIGGERS Edge (Async)**

```typescript
interface AsyncTriggersEdge {
  type: 'TRIGGERS';
  from: EventNode;
  to: EventHandlerNode | SagaNode;

  is_async: boolean;
  delay_ms?: number;
}
```

**R6.4: COMPENSATES Edge**

```typescript
interface CompensatesEdge {
  type: 'COMPENSATES';
  from: FunctionNode;  // Compensation action
  to: FunctionNode;    // Original action

  saga: string;
  step_order: number;
}
```

**R6.5: DEAD_LETTERS_TO Edge**

```typescript
interface DeadLettersToEdge {
  type: 'DEAD_LETTERS_TO';
  from: QueueNode;
  to: QueueNode;  // DLQ

  max_receive_count: number;
}
```

**R6.6: AWAITS Edge**

```typescript
interface AwaitsEdge {
  type: 'AWAITS';
  from: FunctionNode;
  to: FunctionNode;

  is_parallel: boolean;
  timeout_ms?: number;
}
```

---

## Part 3: Technology-Specific Extractors

### R7: AWS (SQS/SNS/EventBridge) Extractor

**R7.1: SQS Patterns**

```typescript
const sqsPatterns = {
  // SDK v3
  sendMessage: /new\s+SendMessageCommand\s*\(\s*\{([^}]+)\}/g,
  receiveMessage: /new\s+ReceiveMessageCommand\s*\(\s*\{([^}]+)\}/g,
  deleteMessage: /new\s+DeleteMessageCommand/g,

  // Queue URL extraction
  queueUrl: /QueueUrl\s*:\s*['"`]([^'"`]+)['"`]/,
  queueName: /\/([^/]+)$/,  // Extract from URL

  // Message body
  messageBody: /MessageBody\s*:\s*(?:JSON\.stringify\()?([^,}]+)/,

  // NestJS SQS
  sqsConsumer: /@SqsMessageHandler\s*\(\s*['"]([^'"]+)['"]/,
  sqsProcess: /@SqsProcess\s*\(\s*['"]([^'"]+)['"]/,
};
```

**R7.2: SNS Patterns**

```typescript
const snsPatterns = {
  publish: /new\s+PublishCommand\s*\(\s*\{([^}]+)\}/g,
  topicArn: /TopicArn\s*:\s*['"`]([^'"`]+)['"`]/,
  subject: /Subject\s*:\s*['"`]([^'"`]+)['"`]/,
  messageAttributes: /MessageAttributes\s*:\s*\{([^}]+)\}/,
};
```

**R7.3: EventBridge Patterns**

```typescript
const eventBridgePatterns = {
  putEvents: /new\s+PutEventsCommand\s*\(\s*\{([^}]+)\}/g,
  eventBusName: /EventBusName\s*:\s*['"`]([^'"`]+)['"`]/,
  source: /Source\s*:\s*['"`]([^'"`]+)['"`]/,
  detailType: /DetailType\s*:\s*['"`]([^'"`]+)['"`]/,
  detail: /Detail\s*:\s*(?:JSON\.stringify\()?([^,}]+)/,
};
```

### R8: RabbitMQ Extractor

**R8.1: amqplib Patterns**

```typescript
const rabbitmqPatterns = {
  // Connection
  connect: /amqp\.connect\s*\(\s*['"`]([^'"`]+)['"`]/,

  // Channel operations
  assertQueue: /channel\.assertQueue\s*\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*\{([^}]+)\})?/g,
  assertExchange: /channel\.assertExchange\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/g,
  bindQueue: /channel\.bindQueue\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]*)['"]/g,

  // Publishing
  publish: /channel\.publish\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]*)['"]/g,
  sendToQueue: /channel\.sendToQueue\s*\(\s*['"`]([^'"`]+)['"]/g,

  // Consuming
  consume: /channel\.consume\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(?:async\s+)?\(?([^)]*)\)?\s*=>/g,
  ack: /channel\.ack\s*\(/g,
  nack: /channel\.nack\s*\(/g,

  // NestJS RabbitMQ
  rabbitSubscribe: /@RabbitSubscribe\s*\(\s*\{([^}]+)\}/,
  rabbitRPC: /@RabbitRPC\s*\(\s*\{([^}]+)\}/,
};
```

### R9: Kafka Extractor

**R9.1: kafkajs Patterns**

```typescript
const kafkaPatterns = {
  // Producer
  producer: /kafka\.producer\s*\(/,
  send: /producer\.send\s*\(\s*\{([^}]+)\}/g,
  topic: /topic\s*:\s*['"`]([^'"`]+)['"`]/,

  // Consumer
  consumer: /kafka\.consumer\s*\(\s*\{\s*groupId\s*:\s*['"`]([^'"`]+)['"]/,
  subscribe: /consumer\.subscribe\s*\(\s*\{\s*(?:topic|topics)\s*:\s*['"`\[]([^'"`\]]+)/g,
  run: /consumer\.run\s*\(\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g,
  eachMessage: /eachMessage\s*:\s*async\s*\(\s*\{([^}]+)\}/,

  // NestJS Kafka
  eventPattern: /@EventPattern\s*\(\s*['"`]([^'"`]+)['"`]/,
  messagePattern: /@MessagePattern\s*\(\s*['"`]([^'"`]+)['"`]/,
};
```

### R10: BullMQ/Bull Extractor

**R10.1: BullMQ Patterns**

```typescript
const bullmqPatterns = {
  // Queue creation
  queue: /new\s+Queue\s*\(\s*['"`]([^'"`]+)['"`]/g,

  // Adding jobs
  add: /\.add\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([^,)]+)/g,
  addBulk: /\.addBulk\s*\(/g,

  // Worker
  worker: /new\s+Worker\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(?:async\s+)?\(?([^)]*)\)?\s*=>/g,

  // Job options
  delay: /delay\s*:\s*(\d+)/,
  attempts: /attempts\s*:\s*(\d+)/,
  backoff: /backoff\s*:\s*\{([^}]+)\}/,
  removeOnComplete: /removeOnComplete\s*:\s*(true|false|\d+)/,
  removeOnFail: /removeOnFail\s*:\s*(true|false|\d+)/,

  // NestJS Bull
  processor: /@Processor\s*\(\s*['"`]([^'"`]+)['"`]/,
  process: /@Process\s*\(\s*['"`]?([^'"`)]*)['"`]?\s*\)/,
  onQueueEvent: /@On(?:Queue)?(?:Active|Completed|Failed|Progress|Removed|Stalled|Waiting|Drained)\s*\(/,
};
```

### R11: Event Emitter/Bus Patterns

**R11.1: Node.js EventEmitter**

```typescript
const eventEmitterPatterns = {
  // Emit
  emit: /\.emit\s*\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*([^)]+))?\)/g,

  // Listen
  on: /\.on\s*\(\s*['"`]([^'"`]+)['"`]\s*,/g,
  once: /\.once\s*\(\s*['"`]([^'"`]+)['"`]\s*,/g,
  addListener: /\.addListener\s*\(\s*['"`]([^'"`]+)['"`]\s*,/g,

  // Remove
  removeListener: /\.removeListener\s*\(\s*['"`]([^'"`]+)['"]/g,
  off: /\.off\s*\(\s*['"`]([^'"`]+)['"]/g,
};
```

**R11.2: NestJS CQRS**

```typescript
const nestjsCqrsPatterns = {
  // Events
  eventHandler: /@EventsHandler\s*\(\s*([^)]+)\s*\)/,
  publishEvent: /this\.eventBus\.publish\s*\(\s*new\s+(\w+)/g,
  publishAll: /this\.eventBus\.publishAll\s*\(/g,

  // Commands
  commandHandler: /@CommandHandler\s*\(\s*(\w+)\s*\)/,
  executeCommand: /this\.commandBus\.execute\s*\(\s*new\s+(\w+)/g,

  // Queries
  queryHandler: /@QueryHandler\s*\(\s*(\w+)\s*\)/,
  executeQuery: /this\.queryBus\.execute\s*\(\s*new\s+(\w+)/g,

  // Sagas
  saga: /@Saga\s*\(\s*\)/,
  ofType: /ofType\s*\(\s*([^)]+)\s*\)/g,
};
```

---

## Part 4: Async Pattern Detection

### R12: Promise/Async Pattern Analysis

**R12.1: Promise Chain Detection**

```typescript
const promisePatterns = {
  // Promise creation
  newPromise: /new\s+Promise\s*\(\s*\(\s*resolve\s*,?\s*reject?\s*\)\s*=>/g,

  // Chaining
  then: /\.then\s*\(\s*(?:async\s+)?\(?([^)]*)\)?\s*=>/g,
  catch: /\.catch\s*\(\s*(?:async\s+)?\(?([^)]*)\)?\s*=>/g,
  finally: /\.finally\s*\(\s*\(\s*\)\s*=>/g,

  // Combinators
  promiseAll: /Promise\.all\s*\(\s*\[/g,
  promiseRace: /Promise\.race\s*\(\s*\[/g,
  promiseAllSettled: /Promise\.allSettled\s*\(\s*\[/g,
  promiseAny: /Promise\.any\s*\(\s*\[/g,

  // Async/await
  asyncFunction: /async\s+(?:function\s+)?(\w+)?\s*\(/g,
  awaitExpression: /await\s+([^;\n]+)/g,
};
```

**R12.2: Unhandled Promise Detection**

```typescript
// Detect potential unhandled rejections
const unhandledPromisePatterns = {
  // Promise without catch
  promiseNoCatch: /new\s+Promise[^;]+(?!\.catch)/,

  // Async without try-catch
  asyncNoTryCatch: /async\s+\w+\s*\([^)]*\)\s*\{(?![^}]*try\s*\{)/,

  // Floating promise (not awaited or returned)
  floatingPromise: /^\s*\w+\.(then|catch)\s*\(/m,
};
```

### R13: RxJS Observable Detection

**R13.1: Observable Patterns**

```typescript
const rxjsPatterns = {
  // Creation
  of: /\bof\s*\(/g,
  from: /\bfrom\s*\(/g,
  interval: /\binterval\s*\(/g,
  timer: /\btimer\s*\(/g,
  fromEvent: /\bfromEvent\s*\(/g,

  // Subjects
  subject: /new\s+Subject\s*</g,
  behaviorSubject: /new\s+BehaviorSubject\s*</g,
  replaySubject: /new\s+ReplaySubject\s*</g,
  asyncSubject: /new\s+AsyncSubject\s*</g,

  // Operators (pipe)
  pipe: /\.pipe\s*\(/g,

  // Common operators
  map: /\bmap\s*\(/g,
  filter: /\bfilter\s*\(/g,
  switchMap: /\bswitchMap\s*\(/g,
  mergeMap: /\bmergeMap\s*\(/g,
  concatMap: /\bconcatMap\s*\(/g,
  exhaustMap: /\bexhaustMap\s*\(/g,
  catchError: /\bcatchError\s*\(/g,
  retry: /\bretry\s*\(/g,
  debounceTime: /\bdebounceTime\s*\(/g,
  distinctUntilChanged: /\bdistinctUntilChanged\s*\(/g,

  // Subscription
  subscribe: /\.subscribe\s*\(/g,
  unsubscribe: /\.unsubscribe\s*\(\)/g,
};
```

---

## Part 5: Distributed Transaction Patterns

### R14: Saga Pattern Detection

**R14.1: Orchestration Saga**

```typescript
const orchestrationSagaPatterns = {
  // Step definition
  step: /\.step\s*\(\s*['"`]([^'"`]+)['"`]/g,

  // Compensation
  compensate: /\.compensate\s*\(\s*['"`]([^'"`]+)['"`]/g,
  onRevert: /\.onRevert\s*\(/g,
  rollback: /\.rollback\s*\(/g,

  // Completion
  onComplete: /\.onComplete\s*\(/g,
  onFailure: /\.onFailure\s*\(/g,
};
```

**R14.2: Choreography Saga**

```typescript
// Detect choreography from event handlers
const choreographySagaPatterns = {
  // Event that triggers next step
  eventChain: /@(?:Event|EventsHandler)\s*\([^)]*\)[^{]*\{[^}]*this\.eventBus\.publish/,

  // Compensation event
  compensationEvent: /(\w+)Compensated|Rollback(\w+)|(\w+)Failed/,
};
```

### R15: Outbox Pattern Detection

**R15.1: Transactional Outbox**

```typescript
const outboxPatterns = {
  // Table operations
  insertOutbox: /INSERT\s+INTO\s+(?:outbox|event_outbox|message_outbox)/i,

  // ORM patterns
  outboxEntity: /@Entity\s*\([^)]*['"`](?:outbox|event_outbox)['"]/,

  // Publisher polling
  outboxPublisher: /findUnprocessed|findPending|getOutboxMessages/,

  // Mark processed
  markProcessed: /markAsProcessed|setProcessed|updateStatus.*processed/i,
};
```

---

## Part 6: Use Cases

### R16: Query Examples

**R16.1: Message Flow Analysis**

```cypher
// Get producer → queue → consumer chain
MATCH (p:Producer)-[:PUBLISHES_TO]->(q:Queue)<-[:CONSUMES_FROM]-(c:Consumer)
RETURN p.name, q.name, c.name, c.file

// Find dead letter queue relationships
MATCH (q:Queue)-[:DEAD_LETTERS_TO]->(dlq:Queue)
RETURN q.name, dlq.name, q.max_receive_count

// Trace event propagation
MATCH path = (e:DomainEvent)-[:TRIGGERS*]->(h:EventHandler)
RETURN path
```

**R16.2: Reliability Analysis**

```cypher
// Find queues without DLQ
MATCH (q:Queue)
WHERE NOT (q)-[:DEAD_LETTERS_TO]->()
RETURN q.name, q.file

// Find consumers without retry policy
MATCH (c:Consumer)
WHERE c.retry_policy IS NULL
RETURN c.name, c.source_name, c.file

// Find non-idempotent event handlers
MATCH (h:EventHandler)
WHERE h.idempotent = false
RETURN h.name, h.handles_events
```

**R16.3: Saga Analysis**

```cypher
// Get all saga steps with compensations
MATCH (s:Saga)
UNWIND s.steps as step
RETURN s.name, step.name, step.action, step.compensation

// Find sagas triggered by event
MATCH (e:DomainEvent)-[:TRIGGERS]->(s:Saga)
RETURN e.name, s.name, s.saga_type
```

---

## Part 7: Integration

### R17: Mesh Builder Integration

**R17.1: Schema Files**

```
schemas/async/
├── aws-sqs-sns.json
├── rabbitmq.json
├── kafka.json
├── bullmq.json
├── eventbridge.json
└── rxjs.json
```

**R17.2: Extractor Classes**

```typescript
// src/mesh-builder/src/extractors/async/
export class SQSExtractor extends BaseAsyncExtractor { ... }
export class SNSExtractor extends BaseAsyncExtractor { ... }
export class RabbitMQExtractor extends BaseAsyncExtractor { ... }
export class KafkaExtractor extends BaseAsyncExtractor { ... }
export class BullMQExtractor extends BaseAsyncExtractor { ... }
export class EventEmitterExtractor extends BaseAsyncExtractor { ... }
export class RxJSExtractor extends BaseAsyncExtractor { ... }
```

**R17.3: Cross-Repo Linking**

```typescript
// Link queues across repositories
interface QueueReference {
  queue_name: string;
  producer_repos: string[];
  consumer_repos: string[];
  schema_definition_repo?: string;
}
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| SQS producer/consumer detection | > 95% |
| Kafka topic extraction | > 95% |
| RabbitMQ exchange/queue detection | > 90% |
| BullMQ job detection | > 95% |
| Event handler mapping | > 90% |
| Saga step extraction | > 85% |
| DLQ relationship detection | > 95% |
| Message schema extraction | > 80% |
| Extraction time (50 queues) | < 10s |

---

## Implementation Phases

### Phase 1: Queue Fundamentals (P1)
- SQS producer/consumer detection
- Basic Kafka topic/consumer extraction
- Queue URL/ARN extraction
- DLQ relationship mapping

### Phase 2: Advanced Messaging (P1)
- RabbitMQ exchange/binding extraction
- Kafka consumer groups
- BullMQ job processing
- Message schema extraction

### Phase 3: Event Patterns (P2)
- NestJS CQRS extraction
- EventEmitter patterns
- Domain event tracking
- Event handler mapping

### Phase 4: Distributed Transactions (P2)
- Saga pattern detection
- Outbox pattern extraction
- Compensation tracking
- Transaction boundary analysis

### Phase 5: Async Flow Analysis (P2)
- Promise chain visualization
- RxJS stream analysis
- Async call graph generation

---

## Open Questions

1. **Cross-Service Tracing**: How to correlate queues across different codebases?
2. **Schema Registry**: Should we integrate with Confluent Schema Registry for Avro schemas?
3. **Temporal/Durable Functions**: Should we support workflow engines like Temporal?
4. **WebSocket**: Are WebSocket pub/sub patterns in scope?

---

## References

- AWS SQS Documentation: https://docs.aws.amazon.com/sqs/
- RabbitMQ Tutorials: https://www.rabbitmq.com/getstarted.html
- Kafka Documentation: https://kafka.apache.org/documentation/
- BullMQ Documentation: https://docs.bullmq.io/
- NestJS CQRS: https://docs.nestjs.com/recipes/cqrs
- Saga Pattern: https://microservices.io/patterns/data/saga.html
