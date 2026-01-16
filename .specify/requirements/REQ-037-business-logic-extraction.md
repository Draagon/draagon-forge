# REQ-037: Business Logic & Domain Extraction

**Status:** Draft
**Priority:** P1
**Created:** 2026-01-15
**Author:** Doug / Claude
**Depends On:** REQ-033 (Code Knowledge Mesh), REQ-034 (Extraction Context Provider)
**Layer:** L3 (draagon-forge) - Programming-specific

---

## Summary

Extract semantic knowledge about business logic, domain models, and application workflows. Enable the Code Knowledge Mesh to understand not just "what code exists" but "what business rules are implemented, what domain concepts exist, and how workflows progress through the system."

**Key Capabilities:**
- **Domain Entity Identification**: Aggregates, entities, value objects from DDD patterns
- **Business Rule Extraction**: Validation logic, constraints, invariants
- **State Machine Detection**: Workflow states, transitions, guards
- **Event/Command Patterns**: Domain events, commands, handlers
- **Use Case Mapping**: Application services to business capabilities
- **Feature Boundary Detection**: Module/bounded context divisions

---

## Problem Statement

### Why Business Logic Extraction Matters

Code structure tells us "what exists" but not "why it matters":

```typescript
// What structural extraction sees:
// - Class: OrderService
// - Method: processOrder(orderId: string)
// - Calls: paymentService.charge(), inventoryService.reserve()

// What we NEED to understand:
// - This implements the "Process Order" use case
// - Business rule: Order total must be > $0
// - Business rule: Customer must have valid payment method
// - State transition: Order goes from 'pending' → 'processing' → 'completed'
// - Domain event: OrderProcessed is published on success
// - Saga: If payment fails, inventory reservation must be rolled back
// - This is part of the "Order Management" bounded context
```

### The Domain Knowledge Problem

Business logic is scattered and implicit:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WHERE BUSINESS LOGIC HIDES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   Entity        │  │   Service       │  │   Controller/Handler        │ │
│  │   Validation    │  │   Methods       │  │   Input validation          │ │
│  │   Invariants    │  │   Workflows     │  │   Authorization checks      │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   Domain        │  │   Policy        │  │   Configuration             │ │
│  │   Events        │  │   Classes       │  │   Feature flags             │ │
│  │   Commands      │  │   Strategies    │  │   Business rules engine     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Questions We Can't Answer Today

- What business rules govern order processing?
- What states can an Invoice be in, and what triggers transitions?
- If I change the "discount calculation" rule, what's affected?
- What domain events does OrderService publish?
- What's the complete workflow for "customer onboarding"?
- Which code enforces the "max 3 failed login attempts" rule?

---

## Solution Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC EXTRACTION                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    PATTERN DETECTION                                     │   │
│  │   DDD Patterns | CQRS/ES | State Machines | Saga/Workflow               │   │
│  └──────────────────────────────────┬──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │               SEMANTIC EXTRACTORS                                        │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │   │
│  │  │  Domain     │ │  Business   │ │   State     │ │   Workflow      │   │   │
│  │  │  Model      │ │   Rules     │ │  Machine    │ │    Saga         │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘   │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                  BUSINESS GRAPH NODES                                    │   │
│  │  Aggregate | Entity | ValueObject | Event | Command | Rule | UseCase    │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                  RELATIONSHIP EDGES                                      │   │
│  │  ENFORCES | TRIGGERS | TRANSITIONS | HANDLES | BELONGS_TO               │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Graph Schema - Business Nodes

### R1: Domain Model Nodes

**R1.1: Aggregate Node Type**

```typescript
interface AggregateNode {
  type: 'Aggregate';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // DDD properties
  aggregate_root: string;  // Root entity class
  bounded_context?: string;

  // Contained entities
  entities: string[];
  value_objects: string[];

  // Events
  domain_events: string[];  // Events this aggregate publishes

  // Invariants
  invariants: Array<{
    description: string;
    enforced_by: string;  // Method name
    line: number;
  }>;

  // Documentation
  description?: string;
}
```

**R1.2: DomainEntity Node Type**

```typescript
interface DomainEntityNode {
  type: 'DomainEntity';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Identity
  identity_field: string;
  identity_type: string;

  // Lifecycle
  has_lifecycle: boolean;
  lifecycle_states?: string[];

  // Behavior
  business_methods: Array<{
    name: string;
    description?: string;
    modifies_state: boolean;
    publishes_events: string[];
  }>;

  // Validation
  validation_rules: Array<{
    field?: string;
    rule: string;
    message?: string;
  }>;
}
```

**R1.3: ValueObject Node Type**

```typescript
interface ValueObjectNode {
  type: 'ValueObject';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Immutability
  is_immutable: boolean;

  // Equality
  equality_fields: string[];  // Fields used for equality

  // Validation
  validation_rules: Array<{
    rule: string;
    message?: string;
  }>;

  // Factory
  factory_method?: string;

  // Examples: Money, Email, Address, DateRange
}
```

**R1.4: DomainEvent Node Type**

```typescript
interface DomainEventNode {
  type: 'DomainEvent';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Event properties
  event_type: 'domain' | 'integration' | 'notification';

  // Payload
  payload_schema: Array<{
    name: string;
    type: string;
    required: boolean;
  }>;

  // Source
  published_by: string[];  // Aggregates/services that publish
  trigger_conditions: string[];  // What causes this event

  // Consumers
  handled_by: string[];  // Event handlers

  // Versioning
  version?: string;
  backward_compatible?: boolean;
}
```

**R1.5: Command Node Type**

```typescript
interface CommandNode {
  type: 'Command';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Command properties
  handler: string;  // Command handler class/function

  // Payload
  payload_schema: Array<{
    name: string;
    type: string;
    required: boolean;
    validation?: string;
  }>;

  // Authorization
  required_permissions?: string[];

  // Side effects
  events_produced: string[];
  aggregates_modified: string[];
}
```

### R2: Business Rule Nodes

**R2.1: BusinessRule Node Type**

```typescript
interface BusinessRuleNode {
  type: 'BusinessRule';
  name: string;
  file: string;
  line: number;

  // Rule properties
  rule_type: 'validation' | 'constraint' | 'calculation' | 'policy' | 'invariant';

  // Natural language description
  description: string;

  // Implementation
  implemented_by: Array<{
    type: 'method' | 'class' | 'decorator' | 'config';
    location: string;  // file:line
  }>;

  // Scope
  applies_to: string[];  // Entities/aggregates affected

  // Conditions
  preconditions?: string[];
  postconditions?: string[];

  // Error handling
  violation_message?: string;
  violation_code?: string;

  // Examples
  examples?: Array<{
    input: string;
    valid: boolean;
    reason?: string;
  }>;
}
```

**R2.2: Policy Node Type**

```typescript
interface PolicyNode {
  type: 'Policy';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Policy type
  policy_type: 'pricing' | 'discount' | 'eligibility' | 'approval' | 'limit' | 'custom';

  // Strategy pattern
  strategies?: Array<{
    name: string;
    condition: string;
    implementation: string;
  }>;

  // Configuration
  is_configurable: boolean;
  config_source?: string;  // Where rules come from

  // Dependencies
  depends_on: string[];  // Other policies or data
}
```

### R3: Workflow Nodes

**R3.1: StateMachine Node Type**

```typescript
interface StateMachineNode {
  type: 'StateMachine';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Target
  entity: string;  // What entity has this state
  state_field: string;  // Which field holds state

  // States
  states: Array<{
    name: string;
    is_initial: boolean;
    is_final: boolean;
    description?: string;
  }>;

  // Transitions
  transitions: Array<{
    from: string;
    to: string;
    trigger: string;
    guard?: string;
    action?: string;
  }>;

  // Visualization
  diagram?: string;  // Mermaid/PlantUML
}
```

**R3.2: Workflow/Saga Node Type**

```typescript
interface WorkflowNode {
  type: 'Workflow';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Workflow type
  workflow_type: 'saga' | 'process_manager' | 'choreography' | 'orchestration';

  // Steps
  steps: Array<{
    name: string;
    order: number;
    action: string;  // What this step does
    compensation?: string;  // Rollback action
    timeout?: number;
    retries?: number;
  }>;

  // Triggers
  triggered_by: string[];  // Events/commands that start this
  produces_events: string[];

  // Error handling
  failure_strategy: 'rollback' | 'skip' | 'retry' | 'dead_letter';
}
```

**R3.3: UseCase Node Type**

```typescript
interface UseCaseNode {
  type: 'UseCase';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Use case properties
  description: string;
  actor: string;  // Who performs this

  // Implementation
  entry_point: string;  // Service/controller method

  // Flow
  preconditions: string[];
  main_flow: string[];
  postconditions: string[];
  alternative_flows?: Array<{
    condition: string;
    flow: string[];
  }>;

  // Related
  aggregates_involved: string[];
  events_produced: string[];
  commands_executed: string[];
}
```

---

## Part 2: Graph Schema - Business Edges

### R4: Relationship Types

**R4.1: ENFORCES Edge**

```typescript
// Business rule enforced by code
interface EnforcesEdge {
  type: 'ENFORCES';
  from: FunctionNode | ClassNode;
  to: BusinessRuleNode;

  enforcement_type: 'validation' | 'constraint' | 'guard';
  line: number;
}
```

**R4.2: TRIGGERS Edge**

```typescript
// Action triggers event
interface TriggersEdge {
  type: 'TRIGGERS';
  from: FunctionNode | CommandNode;
  to: DomainEventNode;

  condition?: string;
  is_async: boolean;
}
```

**R4.3: HANDLES Edge**

```typescript
// Handler processes event/command
interface HandlesEdge {
  type: 'HANDLES';
  from: FunctionNode | ClassNode;
  to: DomainEventNode | CommandNode;
}
```

**R4.4: TRANSITIONS Edge**

```typescript
// State machine transition
interface TransitionsEdge {
  type: 'TRANSITIONS';
  from: string;  // State name
  to: string;    // State name

  state_machine: string;
  trigger: string;
  guard?: string;
}
```

**R4.5: BELONGS_TO Edge**

```typescript
// Entity belongs to bounded context
interface BelongsToEdge {
  type: 'BELONGS_TO';
  from: AggregateNode | DomainEntityNode;
  to: BoundedContextNode;
}
```

**R4.6: IMPLEMENTS Edge**

```typescript
// Method implements use case
interface ImplementsUseCaseEdge {
  type: 'IMPLEMENTS';
  from: FunctionNode;
  to: UseCaseNode;
}
```

---

## Part 3: Pattern Detection

### R5: DDD Pattern Detection

**R5.1: Aggregate Detection**

```typescript
// Heuristics for aggregate detection
const aggregatePatterns = {
  // Naming conventions
  naming: [
    /(\w+)Aggregate$/,
    /(\w+)Root$/,
    /Aggregate(\w+)$/,
  ],

  // Decorator/annotation patterns
  decorators: [
    /@AggregateRoot\(/,
    /@Aggregate\(/,
    /# aggregate/i,  // Comment marker
  ],

  // Structural patterns
  structural: {
    // Has ID field
    hasIdentity: /(?:id|uuid|_id)\s*:/i,
    // Has domain events
    publishesEvents: /\.publish\(|\.emit\(|\.dispatch\(/,
    // Has invariant checks
    hasInvariants: /throw\s+(?:new\s+)?(?:\w*Error|\w*Exception)/,
  },
};
```

**R5.2: Value Object Detection**

```typescript
const valueObjectPatterns = {
  // Naming
  naming: [
    /(\w+)Value$/,
    /(\w+)VO$/,
    /Value(\w+)$/,
  ],

  // Common value object names
  commonNames: [
    'Money', 'Currency', 'Email', 'Phone', 'Address',
    'DateRange', 'Price', 'Quantity', 'Percentage',
    'Coordinates', 'Color', 'URL', 'Slug',
  ],

  // Structural
  structural: {
    // Immutable (readonly, final, frozen)
    immutable: /readonly\s+|final\s+|Object\.freeze|@frozen/,
    // Equality by value
    equalsMethod: /equals\s*\(|__eq__\s*\(/,
    // Factory methods
    factory: /static\s+(?:create|from|of)\s*\(/,
  },
};
```

**R5.3: Domain Event Detection**

```typescript
const domainEventPatterns = {
  // Naming
  naming: [
    /(\w+)Event$/,
    /(\w+)Created$/,
    /(\w+)Updated$/,
    /(\w+)Deleted$/,
    /(\w+)Changed$/,
    /(\w+)Occurred$/,
  ],

  // Decorators
  decorators: [
    /@DomainEvent\(/,
    /@Event\(/,
    /@EventHandler\(/,
  ],

  // Base class inheritance
  inheritance: [
    /extends\s+(?:Domain)?Event/,
    /extends\s+BaseEvent/,
    /implements\s+(?:I)?(?:Domain)?Event/,
  ],

  // Event bus publishing
  publishing: [
    /eventBus\.publish\(/,
    /dispatcher\.dispatch\(/,
    /emit\(['"](\w+)['"]/,
    /\.publish\(new\s+(\w+)/,
  ],
};
```

### R6: State Machine Detection

**R6.1: Explicit State Machine Patterns**

```typescript
// Libraries: XState, Robot, State.js
const stateMachineLibraryPatterns = {
  xstate: {
    machine: /createMachine\s*\(\s*\{/,
    states: /states\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/,
    transitions: /on\s*:\s*\{([^}]+)\}/,
  },

  enum_based: {
    // TypeScript enum for states
    stateEnum: /enum\s+(\w+State|\w+Status)\s*\{([^}]+)\}/,
    // Transition methods
    transition: /(?:transition|moveTo|setState)\s*\(\s*(\w+)/,
  },

  django: {
    // django-fsm
    fsmField: /FSMField\s*\(/,
    transition: /@transition\s*\(/,
  },
};
```

**R6.2: Implicit State Machine Detection**

```typescript
// Detect state machines from code patterns
const implicitStateMachinePatterns = {
  // Status field with discrete values
  statusField: /(?:status|state)\s*:\s*['"](\w+)['"]\s*\|/,

  // Switch on status
  statusSwitch: /switch\s*\(\s*(?:this\.)?(?:status|state)\s*\)/,

  // Status transition methods
  transitionMethods: [
    /(?:mark|set|update)(?:As)?(\w+)\s*\(/,  // markAsComplete()
    /(\w+)(?:ed|ing)\s*=\s*true/,  // completed = true
  ],

  // Guard conditions
  guards: [
    /if\s*\(\s*(?:this\.)?(?:status|state)\s*[!=]==?\s*['"](\w+)['"]/,
    /(?:status|state)\s*===?\s*(?:Status|State)\.(\w+)/,
  ],
};
```

### R7: Business Rule Detection

**R7.1: Validation Rule Patterns**

```typescript
const validationPatterns = {
  // Explicit validation
  explicit: [
    /validate\s*\(/,
    /\.validate\(/,
    /isValid\s*\(/,
    /check\s*\(/,
  ],

  // Throw on invalid
  throws: [
    /throw\s+new\s+(\w*(?:Validation|Invalid|Error|Exception))/,
    /raise\s+(\w*(?:Validation|Invalid|Error|Exception))/,
  ],

  // Conditional guards
  guards: [
    /if\s*\(\s*!?\s*(\w+)\s*[<>=!]+/,  // if (amount <= 0)
    /if\s*\(\s*!?\s*(\w+)\.length/,     // if (items.length === 0)
  ],

  // Assertion libraries
  assertions: [
    /assert\s*\(/,
    /expect\s*\(/,
    /ensure\s*\(/,
    /require\s*\(/,
  ],
};
```

**R7.2: Business Rule Comment Markers**

```typescript
// Extract rules from comments
const ruleCommentPatterns = [
  // JSDoc tags
  /@rule\s+(.+)/,
  /@invariant\s+(.+)/,
  /@constraint\s+(.+)/,
  /@policy\s+(.+)/,

  // Inline comments
  /\/\/\s*(?:RULE|BR|INVARIANT):\s*(.+)/,
  /#\s*(?:RULE|BR|INVARIANT):\s*(.+)/,

  // Block comments
  /\*\s*Business Rule:\s*(.+)/,
  /\*\s*Invariant:\s*(.+)/,
];
```

---

## Part 4: AI-Assisted Extraction

### R8: Semantic Business Logic Discovery

**R8.1: Use Case Extraction Prompt**

```xml
<prompt>
Analyze this service class and extract use cases (business operations):

File: {file_path}
Content: {file_content}

For each public method, determine:
1. What business operation does this implement?
2. What are the preconditions (validation, auth)?
3. What side effects occur (events, state changes)?
4. What errors can occur and why?

<output_format>
<use_cases>
  <use_case method="processOrder">
    <name>Process Customer Order</name>
    <actor>Customer</actor>
    <description>Validates and processes a customer order, charging payment and reserving inventory</description>
    <preconditions>
      <condition>Order must exist and be in 'pending' state</condition>
      <condition>Customer must have valid payment method</condition>
      <condition>All items must be in stock</condition>
    </preconditions>
    <main_flow>
      <step order="1">Validate order exists and is pending</step>
      <step order="2">Verify inventory availability</step>
      <step order="3">Calculate final price with discounts</step>
      <step order="4">Charge payment method</step>
      <step order="5">Reserve inventory</step>
      <step order="6">Update order status to 'processing'</step>
      <step order="7">Publish OrderProcessed event</step>
    </main_flow>
    <events_produced>
      <event>OrderProcessed</event>
      <event>PaymentCharged</event>
      <event>InventoryReserved</event>
    </events_produced>
    <errors>
      <error condition="Order not found">OrderNotFoundException</error>
      <error condition="Payment fails">PaymentFailedException</error>
      <error condition="Out of stock">InsufficientInventoryException</error>
    </errors>
  </use_case>
</use_cases>
</output_format>
</prompt>
```

**R8.2: Business Rule Extraction Prompt**

```xml
<prompt>
Analyze this code and extract business rules:

File: {file_path}
Content: {file_content}

Look for:
1. Validation logic (if statements that throw/return errors)
2. Business constraints (limits, thresholds, requirements)
3. Calculation rules (pricing, discounts, fees)
4. Policy decisions (eligibility, approval criteria)

For each rule found:
- Describe the rule in plain English
- Identify where it's enforced (line number)
- What happens when violated

<output_format>
<business_rules>
  <rule id="BR-001">
    <description>Order total must be greater than $0</description>
    <type>validation</type>
    <enforced_at line="45">OrderService.validateOrder()</enforced_at>
    <condition>order.total > 0</condition>
    <violation_error>InvalidOrderException</violation_error>
    <violation_message>Order total must be positive</violation_message>
  </rule>
  <rule id="BR-002">
    <description>Discount cannot exceed 50% of order total</description>
    <type>constraint</type>
    <enforced_at line="67">DiscountPolicy.apply()</enforced_at>
    <condition>discount.amount <= order.total * 0.5</condition>
    <violation_error>ExcessiveDiscountException</violation_error>
  </rule>
</business_rules>
</output_format>
</prompt>
```

**R8.3: State Machine Discovery Prompt**

```xml
<prompt>
Analyze this entity/aggregate and discover state machine behavior:

Entity: {entity_name}
File: {file_path}
Content: {file_content}

Look for:
1. Status/state fields (enum or string with discrete values)
2. Methods that change state
3. Conditions/guards that check current state
4. Transitions between states

<output_format>
<state_machine entity="Order" state_field="status">
  <states>
    <state name="draft" initial="true">Order created but not submitted</state>
    <state name="pending">Order submitted, awaiting processing</state>
    <state name="processing">Order being fulfilled</state>
    <state name="shipped">Order shipped to customer</state>
    <state name="delivered" final="true">Order delivered</state>
    <state name="cancelled" final="true">Order cancelled</state>
  </states>
  <transitions>
    <transition from="draft" to="pending" trigger="submit()" />
    <transition from="pending" to="processing" trigger="process()" guard="hasValidPayment()" />
    <transition from="processing" to="shipped" trigger="ship()" />
    <transition from="shipped" to="delivered" trigger="confirmDelivery()" />
    <transition from="draft" to="cancelled" trigger="cancel()" />
    <transition from="pending" to="cancelled" trigger="cancel()" />
  </transitions>
</state_machine>
</output_format>
</prompt>
```

---

## Part 5: Bounded Context Detection

### R9: Module Boundary Analysis

**R9.1: Folder-Based Context Detection**

```typescript
// Detect bounded contexts from folder structure
const contextPatterns = {
  // Common folder patterns
  folders: [
    /src\/(?:modules|domains|contexts|features)\/(\w+)/,
    /app\/(\w+)\/(?:models|services|controllers)/,
    /packages\/(\w+)/,
  ],

  // Namespace patterns
  namespaces: [
    /namespace\s+(\w+)\s*\{/,
    /module\s+(\w+)\s*\{/,
  ],

  // Package patterns (Java/Python)
  packages: [
    /package\s+([\w.]+);/,  // Java
    /from\s+([\w.]+)\s+import/,  // Python
  ],
};
```

**R9.2: Context Map Detection**

```typescript
interface ContextRelationship {
  upstream: string;
  downstream: string;
  relationship_type:
    | 'partnership'
    | 'shared_kernel'
    | 'customer_supplier'
    | 'conformist'
    | 'anticorruption_layer'
    | 'open_host_service'
    | 'published_language';
  integration_pattern: 'sync' | 'async' | 'event';
}

// Detect cross-context dependencies
const crossContextPatterns = {
  // Imports from other contexts
  imports: /import\s+.*from\s+['"]@?(\w+)\//,

  // Anti-corruption layer
  acl: [
    /(\w+)Adapter$/,
    /(\w+)Translator$/,
    /(\w+)Gateway$/,
  ],

  // Shared kernel
  shared: [
    /shared\/|common\//,
    /@shared\//,
  ],
};
```

---

## Part 6: Use Cases

### R10: Query Examples

**R10.1: Business Rule Analysis**

```cypher
// Find all business rules for Order aggregate
MATCH (r:BusinessRule)-[:APPLIES_TO]->(a:Aggregate {name: 'Order'})
RETURN r.name, r.description, r.implemented_by

// What enforces "max discount" rule?
MATCH (f:Function)-[:ENFORCES]->(r:BusinessRule)
WHERE r.description CONTAINS 'discount'
RETURN f.name, f.file, r.description

// Find all validation rules in the system
MATCH (r:BusinessRule)
WHERE r.rule_type = 'validation'
RETURN r.name, r.description, r.applies_to
```

**R10.2: Workflow Analysis**

```cypher
// Get Order state machine
MATCH (sm:StateMachine {entity: 'Order'})
RETURN sm.states, sm.transitions

// What events trigger from OrderProcessed?
MATCH (e:DomainEvent {name: 'OrderProcessed'})<-[:TRIGGERS]-(f:Function)
RETURN f.name, f.file

// Find sagas that handle PaymentFailed
MATCH (w:Workflow)-[:HANDLES]->(e:DomainEvent {name: 'PaymentFailed'})
RETURN w.name, w.steps, w.failure_strategy
```

**R10.3: Domain Model Analysis**

```cypher
// Get all aggregates in Order Management context
MATCH (a:Aggregate)-[:BELONGS_TO]->(bc:BoundedContext {name: 'OrderManagement'})
RETURN a.name, a.entities, a.domain_events

// Find cross-context dependencies
MATCH (a1:Aggregate)-[r:DEPENDS_ON]->(a2:Aggregate)
WHERE a1.bounded_context <> a2.bounded_context
RETURN a1.bounded_context, a1.name, a2.bounded_context, a2.name
```

---

## Part 7: Integration

### R11: Mesh Builder Integration

**R11.1: Schema Files**

```
schemas/business/
├── ddd-patterns.json
├── state-machines.json
├── business-rules.json
└── workflows.json
```

**R11.2: Extractor Classes**

```typescript
// src/mesh-builder/src/extractors/business/
export class AggregateExtractor extends BaseExtractor { ... }
export class DomainEventExtractor extends BaseExtractor { ... }
export class StateMachineExtractor extends BaseExtractor { ... }
export class BusinessRuleExtractor extends BaseExtractor { ... }
export class UseCaseExtractor extends BaseExtractor { ... }
export class BoundedContextExtractor extends BaseExtractor { ... }
```

**R11.3: AI Discovery Integration**

```typescript
// Extend Tier3Discoverer for business logic
interface BusinessDiscoveryContext extends EnrichedTier3Context {
  entity_context?: {
    is_aggregate_root: boolean;
    has_domain_events: boolean;
    has_state_machine: boolean;
  };
  service_context?: {
    is_application_service: boolean;
    use_cases: string[];
  };
}
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Aggregate detection accuracy | > 85% |
| Domain event detection | > 90% |
| State machine detection | > 80% |
| Business rule extraction | > 75% |
| Use case identification | > 70% |
| Bounded context detection | > 85% |
| False positive rate | < 15% |
| AI-assisted extraction time | < 10s per file |

---

## Implementation Phases

### Phase 1: Pattern Detection (P1)
- DDD naming pattern detection
- Explicit decorator/annotation extraction
- Domain event detection
- Basic state machine detection

### Phase 2: AI-Assisted Discovery (P1)
- Use case extraction prompts
- Business rule extraction
- State machine discovery
- Saga/workflow detection

### Phase 3: Bounded Context Analysis (P2)
- Folder-based context detection
- Cross-context dependency mapping
- Context map generation

### Phase 4: Documentation Generation (P2)
- Auto-generate domain glossary
- State machine diagrams (Mermaid)
- Use case documentation

---

## Open Questions

1. **Rule Engine Integration**: Should we support external rule engines (Drools, Easy Rules)?
2. **BPMN/DMN**: Should we parse BPMN workflow definitions?
3. **Event Storming Artifacts**: Can we reverse-engineer event storming from code?
4. **Confidence Thresholds**: What confidence level for AI-extracted business rules?

---

## References

- Domain-Driven Design: https://domainlanguage.com/ddd/
- Event Storming: https://www.eventstorming.com/
- XState Documentation: https://xstate.js.org/
- Saga Pattern: https://microservices.io/patterns/data/saga.html
