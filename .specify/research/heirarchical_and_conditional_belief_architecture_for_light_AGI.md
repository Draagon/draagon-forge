# **Hierarchical & Conditional Belief Architecture for Light AGI**

Jan 13, 2026

## **The Core Problem**

You're asking about one of the deepest problems in knowledge representation: **how do we model beliefs that are**:

1. **Conditional** \- "Use async/await for I/O" → BUT ONLY IF "you're in Python 3.5+"
2. **Hierarchical** \- A belief decomposes into sub-beliefs, each with their own conditions
3. **Context-dependent** \- A belief applies in some scopes but not others
4. **Defeasible** \- New information can override old conclusions (non-monotonic)
5. **Compositional** \- Complex beliefs emerge from simpler building blocks

This is the difference between a static knowledge base and a **reasoning system**.

---

## **Research Synthesis**

Based on my research across [belief propagation](https://en.wikipedia.org/wiki/Belief_propagation), [non-monotonic logic](https://en.wikipedia.org/wiki/Non-monotonic_logic), [defeasible reasoning](https://academic.oup.com/logcom/article/35/7/exae044/7749889), [self-organizing knowledge networks](https://arxiv.org/html/2502.13025v1), [hierarchical semantic networks](https://www.geeksforgeeks.org/hierarchical-semantic-networks-in-ai/), and [context ontologies](https://link.springer.com/chapter/10.1007/978-3-319-17996-4_28), here are the key paradigms:

### **Paradigm 1: Bayesian Belief Networks**

Represent conditional dependencies as directed acyclic graphs where each node's probability depends on its parents.

**Pros**: Mathematically rigorous, proven inference algorithms

**Cons**: Requires explicit probability distributions, computationally expensive, doesn't handle defeasibility well

### **Paradigm 2: Defeasible Logic / Non-Monotonic Reasoning**

Conclusions are tentative and can be retracted when new evidence arrives. Rules have priorities and exceptions.

**Pros**: Matches human reasoning, handles exceptions naturally

**Cons**: Complex priority resolution, can be computationally intractable

### **Paradigm 3: Contextual/Scoped Ontologies**

Beliefs are partitioned into contexts (scopes), with rules governing visibility and inheritance between contexts.

**Pros**: Clean separation, prevents belief pollution across domains

**Cons**: Rigid boundaries, cross-context reasoning is awkward

### **Paradigm 4: Hypergraph Knowledge Networks**

Recent research shows [self-organizing knowledge networks](https://arxiv.org/html/2502.13025v1) can emerge through iterative reasoning without predefined ontologies. Scale-free topology with conceptual hubs.

**Pros**: Emergent structure, handles complexity gracefully

**Cons**: Less predictable, requires many iterations to stabilize

### **Paradigm 5: Neurosymbolic Hybrid (LLM \+ Graph)**

Use LLM for semantic understanding and graph for structure. The LLM interprets conditions; the graph tracks dependencies.

**Pros**: Leverages LLM flexibility, structured reasoning

**Cons**: LLM calls add latency, potential inconsistency

---

## **What draagon-ai Already Has**

The exploration revealed **excellent foundations** but no conditional belief support yet:

| Component                              | Status     | Relevance                    |
| -------------------------------------- | ---------- | ---------------------------- |
| `AgentBelief` with confidence          | ✅ Exists  | Base to extend               |
| `HierarchicalScope` with permissions   | ✅ Exists  | Context scoping ready        |
| `TemporalNode` with validity intervals | ✅ Exists  | Time-bounded conditions      |
| `derived_from` / `supersedes` edges    | ✅ Exists  | Dependency tracking          |
| Presupposition extraction              | ✅ Exists  | Implicit condition detection |
| `PresuppositionTrigger.COUNTERFACTUAL` | ✅ Exists  | "If X had..." detection      |
| Conditional belief structure           | ❌ Missing | Need to build                |
| Belief dependency graph                | ❌ Missing | Need to build                |
| Condition evaluation engine            | ❌ Missing | Need to build                |

---

## **Design Options**

### **Option A: Flat Conditional Beliefs (Simple)**

Store conditions as metadata on beliefs. No hierarchy \- just key-value conditions.

@dataclass  
class ConditionalBelief(AgentBelief):  
 conditions: dict\[str, str\] \# {"language": "python", "version": "\>=3.5"}  
 scope_ids: list\[str\] \# Where this applies

**Evaluation**: Check if current context matches all conditions.

Belief: "Use async/await for I/O operations"  
Conditions: {language: "python", version: "\>=3.5", io_type: "network"}

**Pros**: Simple, fast evaluation, easy to implement

**Cons**: Can't express nested conditions, no belief dependencies, conditions are opaque strings

**Verdict**: Too simple for AGI aspirations. Fine for MVP.

---

### **Option B: Belief Trees with Scoped Activation**

Beliefs form a tree. Parent beliefs must be "active" for children to be considered. Activation depends on scope context.

ROOT: "Python Best Practices" (always active)  
├── "Use type hints" (active when: Python \>= 3.5)  
│ ├── "Use Protocol for interfaces" (active when: Python \>= 3.8)  
│ └── "Use TypeVar for generics" (active when: always)  
└── "Handle exceptions properly" (active when: always)  
 ├── "Never bare except" (active when: production code)  
 └── "Log before re-raise" (active when: has logging)

@dataclass  
class BeliefNode:  
 belief: AgentBelief  
 parent_id: str | None  
 children_ids: list\[str\]

    \# Activation condition (LLM-parseable)
    activation\_condition: str | None  \# "Python version \>= 3.8"
    activation\_scope\_types: list\[ScopeType\]

    \# Computed at runtime
    is\_active: bool \= False

**Pros**: Natural hierarchy, scope-aware, intuitive mental model

**Cons**: Tree structure is limiting (beliefs often have multiple parents), activation cascades can be expensive

**Verdict**: Better, but DAG would be more flexible than tree.

---

### **Option C: Belief Dependency DAG with Defeasible Edges**

Beliefs form a directed acyclic graph. Edges represent dependencies with **defeasibility levels**.

class DependencyType(Enum):  
 REQUIRES \= "requires" \# B requires A to be true  
 STRENGTHENS \= "strengthens" \# B increases confidence in A  
 WEAKENS \= "weakens" \# B decreases confidence in A  
 OVERRIDES \= "overrides" \# B defeats A when both apply  
 SPECIALIZES \= "specializes" \# B is a more specific version of A

@dataclass  
class BeliefEdge:  
 source_id: str \# Dependent belief  
 target_id: str \# Dependency  
 dependency_type: DependencyType  
 condition: str | None \# "when source.domain \== target.domain"  
 priority: int \= 0 \# For conflict resolution

**Example**:

"Use parameterized queries"  
 \--\[REQUIRES\]--\> "Working with SQL database"  
 \--\[OVERRIDES(priority=10)\]--\> "String concatenation is fine for queries"  
 \--\[SPECIALIZES\]--\> "Prevent injection attacks"

"Use ORM instead of raw SQL"  
 \--\[OVERRIDES(priority=5)\]--\> "Use parameterized queries"  
 \--\[REQUIRES\]--\> "Complex data model"

When evaluating "how to build queries":

1. Check which beliefs are active given current context
2. Apply override rules by priority
3. Return winning beliefs with confidence adjusted by strengthening/weakening edges

**Pros**: Handles exceptions, priorities, rich relationships

**Cons**: Complex conflict resolution, potential cycles (need detection), expensive traversal

**Verdict**: Powerful but needs careful implementation.

---

### **Option D: Contextual Belief Spaces (Inspired by Situation Calculus)**

Each "situation" or "context" is a complete belief space. Beliefs exist within contexts, and contexts can inherit from parent contexts.

@dataclass  
class BeliefContext:  
 context_id: str  
 name: str \# "Python 3.11 \+ FastAPI \+ Production"

    \# Inheritance
    parent\_context\_ids: list\[str\]

    \# Constraints that define this context
    constraints: list\[ContextConstraint\]  \# Evaluated against environment

    \# Beliefs local to this context
    local\_beliefs: dict\[str, AgentBelief\]

    \# Override rules
    overrides: dict\[str, str\]  \# belief\_id \-\> replacement\_belief\_id

@dataclass  
class ContextConstraint:  
 attribute: str \# "python_version", "framework", "environment"  
 operator: str \# "==", "\>=", "in", "matches"  
 value: Any

**Inheritance Resolution**:

GlobalContext (base truths)  
└── PythonContext (Python-specific beliefs)  
 └── Python3Context (Python 3 specific)  
 ├── FastAPIContext (overrides some web beliefs)  
 └── DjangoContext (different overrides)

When querying beliefs:

1. Determine current context from environment
2. Walk inheritance chain
3. Apply overrides at each level
4. Return merged belief set

**Pros**: Clean separation, predictable inheritance, matches how developers think about environments

**Cons**: Contexts must be predefined, cross-context reasoning is awkward, explosion of context combinations

**Verdict**: Great for environment-specific beliefs, less suitable for arbitrary conditions.

---

### **Option E: Hypergraph Belief Network (Research-Inspired)**

Based on [self-organizing knowledge networks](https://arxiv.org/html/2502.13025v1), beliefs and conditions form a hypergraph where:

- **Nodes**: Beliefs, Entities, Conditions, Contexts
- **Hyperedges**: Connect multiple nodes simultaneously (not just pairs)

@dataclass  
class HyperEdge:  
 edge_id: str  
 edge_type: str \# "IMPLIES", "CONFLICTS", "REQUIRES_ALL", "REQUIRES_ANY"  
 node_ids: list\[str\] \# Can be 2+ nodes  
 strength: float  
 metadata: dict

\# Example: "If (Python \>= 3.8) AND (using_typing) THEN (use Protocol)"  
HyperEdge(  
 edge_type="IMPLIES",  
 node_ids=\[  
 "condition:python\>=3.8",  
 "condition:using_typing",  
 "belief:use_protocol"  
 \],  
 strength=0.9  
)

**Belief Propagation**: Use [loopy belief propagation](https://www.science.org/doi/10.1126/sciadv.abf1211) to compute marginal probabilities given evidence.

**Pros**: Most expressive, handles complex multi-way relationships, emergent structure

**Cons**: Complex implementation, computationally expensive, harder to debug/explain

**Verdict**: Most powerful but highest complexity. Good for research/future.

---

### **Option F: Hybrid LLM-Graph (Recommended for Draagon)**

**Key Insight**: Use the LLM's semantic understanding for condition evaluation, and the graph for structure/dependencies.

@dataclass  
class SemanticBelief:  
 """A belief with semantic conditions evaluated by LLM."""

    \# Core belief (from AgentBelief)
    belief\_id: str
    content: str
    conviction: float

    \# Semantic conditions (natural language, LLM-evaluated)
    conditions: list\[SemanticCondition\]

    \# Structural dependencies (graph edges)
    depends\_on: list\[str\]      \# Belief IDs that must be active
    conflicts\_with: list\[str\]  \# Belief IDs that cannot coexist
    specializes: str | None    \# Parent belief this refines

    \# Decomposition (sub-beliefs)
    sub\_beliefs: list\[str\]     \# Child belief IDs
    is\_composite: bool         \# True if this is a container

    \# Scope constraints
    scope\_constraints: list\[str\]  \# Scope IDs where this applies


@dataclass  
class SemanticCondition:  
 """A condition expressed in natural language."""

    condition\_text: str          \# "when using Python 3.8 or higher"
    condition\_type: str          \# "version", "environment", "goal", "temporal"

    \# Cached extraction (from Phase 0/1)
    extracted\_entities: list\[str\]
    extracted\_constraints: dict\[str, Any\]

    \# Evaluation
    last\_evaluated: datetime | None
    last\_result: bool | None
    evaluation\_context: dict | None  \# What context was used

**Evaluation Flow**:

1\. Query: "What beliefs apply to current task?"

2\. Filter by scope:  
 \- Current scope hierarchy  
 \- Permission check

3\. Filter by structural dependencies:  
 \- Check depends_on beliefs are active  
 \- Check conflicts_with beliefs are not active

4\. Evaluate semantic conditions (LLM):  
 \- For each remaining belief  
 \- Ask LLM: "Given context {X}, does condition '{Y}' apply?"  
 \- Cache result with context hash

5\. Resolve conflicts:  
 \- If multiple beliefs conflict, use conviction \+ specificity  
 \- More specific (deeper specialization) wins

6\. Return active beliefs with effective conviction

**Condition Evaluation Prompt**:

\<context\>  
 \<current_file\>api/routes.py\</current_file\>  
 \<language\>python\</language\>  
 \<framework\>fastapi\</framework\>  
 \<python_version\>3.11\</python_version\>  
 \<environment\>development\</environment\>  
\</context\>

\<condition\>when building REST APIs with automatic validation\</condition\>

\<question\>Does this condition apply to the current context?\</question\>

\<response_format\>  
 \<applies\>true|false\</applies\>  
 \<confidence\>0.0-1.0\</confidence\>  
 \<reasoning\>brief explanation\</reasoning\>  
\</response_format\>

---

## **Recommended Design: Layered Semantic Belief System**

Based on the research and draagon-ai's existing infrastructure, I recommend a **layered approach**:

### **Layer 1: Atomic Beliefs (Leaf Nodes)**

Simple, unconditional beliefs extracted from text. These are the building blocks.

"Parameterized queries prevent SQL injection" (conviction: 0.95)  
"SQL injection is a security threat" (conviction: 0.98)  
"Use connection pooling for databases" (conviction: 0.85)

### **Layer 2: Conditional Beliefs**

Atomic beliefs wrapped with semantic conditions.

"Use async database drivers"  
 WHEN: "high-concurrency web application"  
 CONVICTION: 0.88

### **Layer 3: Composite Beliefs**

Hierarchical groupings that decompose into sub-beliefs.

"Database Best Practices" (composite)  
├── "Connection Management"  
│ ├── "Use connection pooling" (conviction: 0.85)  
│ └── "Close connections explicitly" (conviction: 0.90)  
│ WHEN: "not using context managers"  
└── "Query Safety"  
 ├── "Use parameterized queries" (conviction: 0.95)  
 └── "Validate input before queries" (conviction: 0.88)

### **Layer 4: Defeasible Rules**

Override relationships between beliefs.

"Use ORM" OVERRIDES "Use raw SQL"  
 WHEN: "complex domain model"  
 PRIORITY: 5

"Use raw SQL" OVERRIDES "Use ORM"  
 WHEN: "performance-critical queries"  
 PRIORITY: 7

### **Layer 5: Context Spaces**

Predefined contexts that activate/deactivate belief subsets.

ProductionContext:  
 ACTIVATES: \["logging", "error-handling", "security"\]  
 DEACTIVATES: \["debug-helpers", "verbose-output"\]  
 OVERRIDES: {"retry-once" \-\> "retry-with-backoff"}

---

## **Neo4j Schema for Layered Beliefs**

// Atomic belief  
(:Belief {  
 id: string,  
 content: string,  
 conviction: float,  
 layer: "atomic" | "conditional" | "composite",  
 is_active: boolean  
})

// Semantic condition  
(:Condition {  
 id: string,  
 text: string,  
 condition_type: string,  
 cached_result: boolean,  
 cached_at: datetime  
})

// Context space  
(:Context {  
 id: string,  
 name: string,  
 constraints: json  
})

// Entity (from decomposition)  
(:Entity {  
 id: string,  
 canonical_name: string,  
 entity_type: string  
})

// Relationships  
(:Belief)-\[:HAS_CONDITION\]-\>(:Condition)  
(:Belief)-\[:DEPENDS_ON\]-\>(:Belief)  
(:Belief)-\[:CONFLICTS_WITH\]-\>(:Belief)  
(:Belief)-\[:SPECIALIZES\]-\>(:Belief)  
(:Belief)-\[:DECOMPOSES_TO\]-\>(:Belief) // Composite \-\> children  
(:Belief)-\[:OVERRIDES {priority: int, condition_id: string}\]-\>(:Belief)  
(:Belief)-\[:MENTIONS\]-\>(:Entity)  
(:Context)-\[:ACTIVATES\]-\>(:Belief)  
(:Context)-\[:DEACTIVATES\]-\>(:Belief)  
(:Context)-\[:INHERITS_FROM\]-\>(:Context)

---

## **Belief Evaluation Algorithm**

async def get_active_beliefs(  
 query: str,  
 current_context: dict,  
 scope: HierarchicalScope,  
) \-\> list\[EvaluatedBelief\]:  
 """  
 Get all beliefs that apply to the current query and context.

    1\. Semantic search for relevant beliefs
    2\. Filter by scope permissions
    3\. Resolve structural dependencies
    4\. Evaluate semantic conditions (LLM)
    5\. Apply defeasible overrides
    6\. Return ranked results
    """

    \# Step 1: Semantic search
    candidates \= await neo4j.query("""
        CALL db.index.fulltext.queryNodes('belief\_content', $query)
        YIELD node, score
        MATCH (node)-\[:HAS\_CONDITION\]-\>(c:Condition)
        OPTIONAL MATCH (node)-\[:DEPENDS\_ON\]-\>(dep:Belief)
        OPTIONAL MATCH (node)-\[:CONFLICTS\_WITH\]-\>(conf:Belief)
        OPTIONAL MATCH (node)-\[:SPECIALIZES\]-\>(parent:Belief)
        RETURN node, collect(c) as conditions,
               collect(dep) as dependencies,
               collect(conf) as conflicts,
               parent, score
        ORDER BY score DESC
        LIMIT 50
    """, {"query": query})

    \# Step 2: Filter by scope
    candidates \= \[c for c in candidates if scope.can\_access(c.node.id)\]

    \# Step 3: Check structural dependencies
    active\_ids \= set()
    for candidate in candidates:
        deps\_satisfied \= all(
            dep.id in active\_ids or await is\_unconditionally\_active(dep)
            for dep in candidate.dependencies
        )
        no\_conflicts \= not any(
            conf.id in active\_ids
            for conf in candidate.conflicts
        )
        if deps\_satisfied and no\_conflicts:
            active\_ids.add(candidate.node.id)

    candidates \= \[c for c in candidates if c.node.id in active\_ids\]

    \# Step 4: Evaluate semantic conditions (LLM, with caching)
    evaluated \= \[\]
    for candidate in candidates:
        conditions\_met \= True
        for condition in candidate.conditions:
            \# Check cache first
            cache\_key \= hash((condition.id, json.dumps(current\_context)))
            if cached := await condition\_cache.get(cache\_key):
                result \= cached
            else:
                \# LLM evaluation
                result \= await llm.evaluate\_condition(
                    condition.text,
                    current\_context
                )
                await condition\_cache.set(cache\_key, result, ttl=3600)

            if not result.applies:
                conditions\_met \= False
                break

        if conditions\_met:
            evaluated.append(EvaluatedBelief(
                belief=candidate.node,
                effective\_conviction=candidate.node.conviction \* result.confidence,
                matched\_conditions=\[c.text for c in candidate.conditions\],
            ))

    \# Step 5: Apply defeasible overrides
    final \= apply\_overrides(evaluated, current\_context)

    \# Step 6: Rank by effective conviction and specificity
    final.sort(key=lambda b: (
        \-b.effective\_conviction,
        \-len(b.matched\_conditions),  \# More specific \= better
    ))

    return final

---

## **Why This Design for Light AGI**

This design supports the flexibility needed for AGI-like reasoning:

| AGI Requirement                 | How This Design Addresses It                                  |
| ------------------------------- | ------------------------------------------------------------- |
| **Handle ambiguity**            | LLM evaluates semantic conditions, not rigid pattern matching |
| **Learn from experience**       | Conviction scores update based on outcomes                    |
| **Reason with incomplete info** | Defeasible rules allow tentative conclusions                  |
| **Adapt to context**            | Context spaces \+ semantic conditions                         |
| **Explain reasoning**           | Graph structure provides traceable inference chain            |
| **Handle exceptions**           | Override relationships with priorities                        |
| **Compose knowledge**           | Composite beliefs decompose hierarchically                    |
| **Scale gracefully**            | Neo4j handles large graphs, LLM calls are cached              |
| **Remain debuggable**           | Graph is inspectable, conditions are natural language         |

---

## **Implementation Phases**

### **Phase 1: Foundation (Extend REQ-032)**

- Add `SemanticCondition` model
- Add `conditions` field to belief storage
- Store condition relationships in Neo4j
- Basic condition extraction during decomposition

### **Phase 2: Dependency Graph**

- Add `DEPENDS_ON`, `CONFLICTS_WITH`, `SPECIALIZES` edges
- Implement dependency resolution algorithm
- Add cycle detection

### **Phase 3: Defeasible Overrides**

- Add `OVERRIDES` relationship with priority
- Implement conflict resolution
- Add explanation generation for overrides

### **Phase 4: Composite Beliefs**

- Add `DECOMPOSES_TO` relationship
- Implement hierarchical belief construction
- Add conviction aggregation (parent \= f(children))

### **Phase 5: Context Spaces**

- Add `Context` nodes with constraints
- Implement context matching
- Add context inheritance

### **Phase 6: LLM Condition Evaluation**

- Build condition evaluation prompts
- Implement caching strategy
- Add confidence calibration

---

## **Final Recommendation**

**Start with Option F (Hybrid LLM-Graph)** implemented in phases:

1. **Immediate** (REQ-032 extension): Add semantic conditions to beliefs, store in Neo4j
2. **Short-term**: Add dependency edges and conflict detection
3. **Medium-term**: Composite beliefs and override rules
4. **Long-term**: Full context spaces and LLM condition evaluation

This approach:

- Builds on existing draagon-ai infrastructure
- Maintains LLM-first philosophy (conditions are semantic, not patterns)
- Provides graph structure for reasoning/explanation
- Scales from simple to complex as needed
- Positions draagon-forge for genuine AGI-like flexibility

The key insight is: **don't try to formalize everything upfront**. Let the LLM handle semantic interpretation, and use the graph for structure and relationships. This is exactly what [neurosymbolic approaches](https://arxiv.org/pdf/2302.07200) recommend.

---

## **Sources**

- [Bayesian Networks](https://en.wikipedia.org/wiki/Bayesian_network) \- Conditional probability foundations
- [Non-Monotonic Logic](https://en.wikipedia.org/wiki/Non-monotonic_logic) \- Defeasible reasoning theory
- [Defeasible Logic Revision](https://academic.oup.com/logcom/article/35/7/exae044/7749889) \- Modern revision approaches
- [Self-Organizing Knowledge Networks](https://arxiv.org/html/2502.13025v1) \- Emergent graph structure
- [Hierarchical Semantic Networks](https://www.geeksforgeeks.org/hierarchical-semantic-networks-in-ai/) \- Knowledge organization
- [Context in Ontologies](https://link.springer.com/chapter/10.1007/978-3-319-17996-4_28) \- Scoped knowledge
- [Belief Propagation](https://en.wikipedia.org/wiki/Belief_propagation) \- Inference algorithms
- [Knowledge Graph Reasoning](https://github.com/LIANGKE23/Awesome-Knowledge-Graph-Reasoning) \- Modern approaches
- [Neurosymbolic AI](https://arxiv.org/pdf/2302.07200) \- Hybrid neural-symbolic systems
- [Loopy Belief Propagation](https://www.science.org/doi/10.1126/sciadv.abf1211) \- Graphs with cycles
- [Knowledge Graphs for Agents](https://hypermode.com/blog/how-knowledge-graphs-underpin-ai-agent-applications) \- Practical applications
