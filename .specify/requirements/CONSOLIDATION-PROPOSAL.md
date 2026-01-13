# Requirements Consolidation Proposal

**Created:** 2026-01-13
**Updated:** 2026-01-13
**Status:** Proposed

---

## Executive Summary

After reviewing all requirements AND the draagon-ai codebase, I found that **draagon-ai already has the abstractions we need**. The key issue is that our requirements invented new terminology instead of using draagon-ai's existing models.

**Recommendation:** Align Draagon Forge terminology with draagon-ai. Don't invent new concepts.

---

## What draagon-ai Already Has

### Core Data Models (USE THESE)

| draagon-ai Model | Location | What It's For |
|------------------|----------|---------------|
| `Memory` | `memory/base.py` | Base memory unit with confidence, importance, scope |
| `MemoryType` | `memory/base.py` | FACT, BELIEF, OBSERVATION, INSIGHT, SKILL, etc. |
| `MemoryScope` | `memory/base.py` | WORLD, CONTEXT, AGENT, USER, SESSION |
| `UserObservation` | `core/types.py` | Raw input - immutable record of what was said |
| `AgentBelief` | `core/types.py` | Reconciled belief from multiple observations |
| `BeliefType` | `core/types.py` | household_fact, verified_fact, inferred, etc. |
| `TemporalNode` | `memory/temporal_nodes.py` | Graph node with bi-temporal tracking |
| `NodeType` | `memory/temporal_nodes.py` | BELIEF, FACT, INSIGHT, SKILL, BEHAVIOR, etc. |

### Multi-Agent Orchestration (USE THESE)

| draagon-ai Model | Location | What It's For |
|------------------|----------|---------------|
| `TransactiveMemory` | `orchestration/transactive_memory.py` | "Who knows what" - expertise tracking |
| `ExpertiseEntry` | `orchestration/transactive_memory.py` | Agent expertise with success/failure counts |
| `SharedWorkingMemory` | `orchestration/shared_memory.py` | Multi-agent coordination |
| `SharedObservation` | `orchestration/shared_memory.py` | Observation in shared memory |
| `Learning` | `orchestration/learning_channel.py` | Cross-agent knowledge sharing |
| `LearningType` | `orchestration/learning_channel.py` | FACT, SKILL, INSIGHT, CORRECTION, BEHAVIOR |
| `LearningScope` | `orchestration/learning_channel.py` | PRIVATE, CONTEXT, GLOBAL |

### Already Has Conflict Detection

draagon-ai's `cognition/beliefs.py` already implements:
- `BELIEF_FORMATION_PROMPT` - LLM-driven belief reconciliation
- `CONFLICT_RESOLUTION_PROMPT` - Conflict resolution strategies
- `OBSERVATION_EXTRACTION_PROMPT` - Extract observations from input

---

## Mapping: Our REQs → draagon-ai Concepts

### Terminology We Invented vs What Exists

| Our Invented Term | draagon-ai Equivalent | Action |
|-------------------|----------------------|--------|
| "Unified Belief System" (REQ-001) | `AgentBelief` + `MemoryType.BELIEF` | Use existing |
| "belief_type: principle" | `BeliefType` + custom enum value | Extend existing |
| "belief_type: pattern" | `MemoryType.SKILL` or custom | Extend existing |
| "belief_type: learning" | `LearningType` from learning_channel | Use existing |
| "Finding" (REQ-022) | `SharedObservation` from shared_memory | Use existing |
| "KnowledgeAtom" (proposed) | **DELETE** - use `Memory` | Don't create |
| "AgentOperation" (REQ-020) | `Memory` with `MemoryType.EPISODIC` | Use existing |
| "Expertise tracking" (REQ-022) | `TransactiveMemory` + `ExpertiseEntry` | Use existing |
| "Conflict detection" (REQ-025) | `cognition/beliefs.py` reconciliation | Use existing |
| "Learning extraction" (REQ-026) | `Learning` + `LearningChannel` | Use existing |
| "Session/Context scoping" | `MemoryScope` + `HierarchicalScope` | Use existing |

### What We Actually Need to Add

| Draagon Forge Need | How to Implement |
|-------------------|------------------|
| Principles (architectural rules) | Add `PRINCIPLE` to `BeliefType` enum |
| Patterns (code examples) | Add `PATTERN` to `BeliefType` or use `SKILL` |
| Conviction scores | Add field to `AgentBelief` (separate from confidence) |
| Watch rules | Extend `Memory` with `MemoryType.INSTRUCTION` |
| Developer correction detection | Use existing `CORRECTION` in `LearningType` |
| Code review findings | Use `SharedObservation` with belief_type |

---

## Revised REQ Consolidation

### Option A: Minimal Changes (RECOMMENDED)

**Keep existing REQs but update terminology to match draagon-ai:**

1. **REQ-001** stays as MCP Context Server
   - Change "unified belief system" → "uses draagon-ai's AgentBelief"
   - Change `add_belief()` signature to match `AgentBelief` fields
   - Add `conviction: float` field to track reinforcement (separate from `confidence`)

2. **REQ-005** stays as Belief Manager UI
   - UI layer on top of REQ-001
   - Uses `query_beliefs()` → actually queries `AgentBelief` via Neo4j

3. **REQ-020** Semantic Context Bundles
   - Change "AgentOperation" → `Memory` with `MemoryType.EPISODIC`
   - Change "session_id" → align with `MemoryScope.SESSION`

4. **REQ-022** Cross-Agent Semantic Memory
   - Change "Finding" → `SharedObservation` (already exists in draagon-ai!)
   - Change "expertise tracking" → use `TransactiveMemory` directly
   - Remove duplicate reconciliation code, use `cognition/beliefs.py`

5. **REQ-025** Cognitive Swarm
   - Change "SharedObservation" → it's the SAME as draagon-ai's, just use it
   - Change "MultiAgentBeliefReconciliation" → use existing reconciliation
   - Change "SwarmTransactiveMemory" → extend existing `TransactiveMemory`

6. **REQ-026** Metacognitive Reflection
   - Change "Learning extraction" → use `Learning` + `LearningChannel`
   - Change "expertise updates" → feed into `TransactiveMemory`
   - Remove pattern recognition duplication

### Option B: Merge REQs (More Aggressive)

If we want to reduce REQ count:

| Merge | Result |
|-------|--------|
| REQ-005 → REQ-001 | Belief Manager becomes part of MCP Server |
| REQ-022 → REQ-025 | Cross-Agent Memory becomes part of Cognitive Swarm |
| REQ-026 → REQ-021 | Reflection becomes part of Dynamic Priming |

**Not recommended** - the REQs serve different purposes even if they share underlying models.

### Option C: Add Core Module (Structural Change)

Create `src/draagon_forge/core/` that imports and re-exports draagon-ai models:

```python
# src/draagon_forge/core/__init__.py
from draagon_ai.memory.base import Memory, MemoryType, MemoryScope
from draagon_ai.core.types import AgentBelief, BeliefType, UserObservation
from draagon_ai.orchestration.transactive_memory import TransactiveMemory, ExpertiseEntry
from draagon_ai.orchestration.shared_memory import SharedWorkingMemory, SharedObservation
from draagon_ai.orchestration.learning_channel import Learning, LearningType, LearningScope

# Draagon Forge extensions
class ConvictionBelief(AgentBelief):
    """AgentBelief extended with conviction score for reinforcement learning."""
    conviction: float = 0.7  # Separate from confidence

class ForgeBeliefType(BeliefType):
    """Extended belief types for Draagon Forge."""
    PRINCIPLE = "principle"  # Architectural rule
    PATTERN = "pattern"      # Code pattern with examples
```

---

## Recommended Path Forward

### Immediate Actions

1. **Update REQ-001** to explicitly state it uses draagon-ai models
2. **Update REQ-022** to use `SharedObservation` and `TransactiveMemory`
3. **Update REQ-025** to reference draagon-ai's shared memory, not reinvent it
4. **Delete "KnowledgeAtom"** from consolidation proposal - it doesn't need to exist

### What to Extend (Not Replace)

| draagon-ai Model | Extension for Draagon Forge |
|------------------|----------------------------|
| `BeliefType` | Add PRINCIPLE, PATTERN values |
| `AgentBelief` | Add `conviction: float` field |
| `MemoryType` | Add WATCH_RULE if needed |
| `TransactiveMemory` | Add developer tracking (not just agents) |

### What NOT to Create

- ~~KnowledgeAtom~~ - Use `Memory`
- ~~AgentOperation~~ - Use `Memory` with `MemoryType.EPISODIC`
- ~~Finding~~ - Use `SharedObservation`
- ~~MultiAgentBeliefReconciliation~~ - Use existing reconciliation
- ~~SwarmTransactiveMemory~~ - Extend existing `TransactiveMemory`

---

## Updated Terminology Glossary

| Term | Definition | draagon-ai Model |
|------|------------|------------------|
| **Belief** | A reconciled piece of knowledge with confidence | `AgentBelief` |
| **Conviction** | How strongly held (reinforced/weakened over time) | New field on `AgentBelief` |
| **Confidence** | How certain we are this is correct | `AgentBelief.confidence` |
| **Observation** | Raw input before reconciliation | `UserObservation` |
| **Shared Observation** | Observation visible to multiple agents | `SharedObservation` |
| **Learning** | Knowledge extracted and shared | `Learning` |
| **Expertise** | Agent/developer skill in a domain | `ExpertiseEntry` |
| **Memory** | Base storage unit | `Memory` |
| **Scope** | Visibility level (world/context/agent/session) | `MemoryScope` |

---

## Next Steps

1. [ ] Decide: Option A (minimal) or Option C (core module)?
2. [ ] Update REQ-001 with draagon-ai alignment
3. [ ] Update REQ-022 to use `SharedObservation`
4. [ ] Update REQ-025 to extend, not reinvent
5. [ ] Create glossary document with term mappings
6. [ ] Review remaining REQs for terminology alignment

---

## Key Insight

> **draagon-ai already solved most of these problems.** Our job is to:
> 1. Expose existing functionality via MCP
> 2. Add VS Code extension UI on top
> 3. Extend with Draagon Forge-specific concepts (conviction, watch rules)
>
> **NOT** to reinvent the abstractions.

---

**Document Status:** Proposed
**Requires Decision:** Option A vs Option C
