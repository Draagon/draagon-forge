# REQ-031: Extension Architecture (draagon-ai-forge)

**Priority:** P0
**Effort:** Medium (5 days)
**Dependencies:** REQ-001
**Blocks:** All domain-specific implementations

---

## Overview

Define a three-layer architecture that separates core AI capabilities (draagon-ai), generic MCP extensions (draagon-ai-forge), and domain-specific implementations (draagon-forge, draagon-forge-health, etc.). This enables reuse across multiple domains while keeping domain-specific logic isolated.

### The Problem

Currently, draagon-forge mixes:
- **Generic capabilities** (conviction scoring, multi-model routing, behavior evolution)
- **Programming-specific capabilities** (`analyze_code()`, `analyze_diff()`, code review)

When we want to build draagon-forge-health (healthcare), draagon-forge-legal, or other domain applications, we'd have to duplicate the generic capabilities.

### The Solution: Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LAYER 1: draagon-ai (Core)                         │
│  Memory, Beliefs, Agents, Behaviors, Orchestration, Learning                 │
│  • AgentBelief, Memory, MemoryType, MemoryScope                              │
│  • SharedWorkingMemory, TransactiveMemory, LearningChannel                   │
│  • Agent, Behavior, BehaviorRegistry                                         │
│  pip install draagon-ai                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     LAYER 2: draagon-ai-forge (Generic Extensions)           │
│  MCP Integration, Multi-Model Routing, Behavior Evolution, Reflection        │
│  • ForgeBeliefType (PRINCIPLE, PATTERN, LEARNING)                            │
│  • conviction scoring, CostOptimizedRouter, BehaviorArchitect                │
│  • Claude Code sync, MCP tool base classes                                   │
│  pip install draagon-ai-forge (depends on draagon-ai)                        │
└─────────────────────────────────────────────────────────────────────────────┘
                    │                              │
                    ▼                              ▼
┌───────────────────────────────┐  ┌───────────────────────────────────────────┐
│ LAYER 3a: draagon-forge       │  │ LAYER 3b: draagon-forge-health            │
│ (Programming Domain)          │  │ (Healthcare Domain)                       │
│ • analyze_code(), analyze_diff│  │ • analyze_diagnosis(), check_protocols    │
│ • Code review behaviors       │  │ • Clinical review behaviors               │
│ • Security/performance agents │  │ • HIPAA compliance agents                 │
│ • VS Code extension           │  │ • EHR integration                         │
│ • Git/GitHub integration      │  │ • HL7/FHIR tools                          │
│ pip install draagon-forge     │  │ pip install draagon-forge-health          │
└───────────────────────────────┘  └───────────────────────────────────────────┘
```

---

## Requirements

### REQ-031.1: Layer Classification

Classify all existing requirements by layer.

#### Layer 2: draagon-ai-forge (Generic)

These capabilities are domain-agnostic and reusable:

| Requirement | Components | Rationale |
|-------------|------------|-----------|
| **REQ-001** (partial) | `ForgeBeliefType`, `conviction`, MCP tool wrappers | Generic belief extensions |
| **REQ-022** (partial) | MCP tool wrappers for SharedWorkingMemory | Generic multi-agent patterns |
| **REQ-023** | BehaviorArchitect | Creating behaviors is domain-agnostic |
| **REQ-024** | BehaviorEvolutionEngine | Evolution is domain-agnostic |
| **REQ-025** | ParallelCognitiveOrchestrator | Swarm coordination is generic |
| **REQ-026** | MetacognitiveReflectionService | Reflection is generic |
| **REQ-027** (partial) | Agent MCP tools, Claude Code sync | Generic bridge to Claude Code |
| **REQ-028** | CostOptimizedRouter, ModelTier | Multi-model routing is generic |

#### Layer 3a: draagon-forge (Programming Domain)

These capabilities are specific to software development:

| Requirement | Components | Rationale |
|-------------|------------|-----------|
| **REQ-001** (partial) | CLAUDE.md seeding | Programming-specific knowledge format |
| **REQ-002** | VS Code extension | IDE-specific |
| **REQ-003** | File/terminal/git watchers | Programming-specific observation |
| **REQ-004** | Correction detection | Code-specific learning |
| **REQ-005** | Belief Manager UI | Generic UI, but programming-focused |
| **REQ-006** | Watch rules for code | Programming-specific monitoring |
| **REQ-007** | Curiosity about code | Programming-specific questions |
| **REQ-008-011** | Code review, PR, architecture agents | Programming-specific agents |
| **REQ-012** | GitHub integration | Programming-specific |
| **REQ-013** | Feedback from code outcomes | Programming-specific |
| **REQ-014-019** | Token optimization | Generic, but implemented for code context |
| **REQ-020-021** | Semantic bundles/priming | Generic, but code-focused |
| **REQ-027.4** | `analyze_code()`, `analyze_diff()` | Programming-specific tools |
| **REQ-029** | GitHub monitoring, CLAUDE.md import | Programming-specific knowledge |
| **REQ-030** | VS Code sidebar | IDE-specific |

### REQ-031.2: Package Structure

Define the package structure for each layer.

#### draagon-ai-forge Package

```
draagon_ai_forge/
├── __init__.py                 # Public API exports
├── core/
│   ├── __init__.py
│   ├── extensions.py           # ForgeBeliefType, conviction field
│   └── provider.py             # Enhanced MemoryProvider wrapper
├── llm/
│   ├── __init__.py
│   ├── models.py               # ModelTier, ModelConfig, LLMProvider
│   ├── classifier.py           # TaskClassifier (generic)
│   ├── router.py               # CostOptimizedRouter
│   ├── escalation.py           # EscalationManager
│   └── providers/
│       ├── __init__.py
│       ├── groq.py             # Groq provider
│       ├── anthropic.py        # Claude provider
│       └── ollama.py           # Ollama provider
├── behaviors/
│   ├── __init__.py
│   ├── architect.py            # BehaviorArchitect
│   ├── evolution.py            # BehaviorEvolutionEngine
│   └── testing.py              # BehaviorTestRunner
├── orchestration/
│   ├── __init__.py
│   ├── swarm.py                # ParallelCognitiveOrchestrator
│   └── reflection.py           # MetacognitiveReflectionService
├── mcp/
│   ├── __init__.py
│   ├── base.py                 # Base MCP tool patterns
│   ├── agents.py               # select_agent, delegate_to_expert (generic)
│   ├── behaviors.py            # list_behaviors, create_behavior
│   ├── routing.py              # select_model, analyze_with_routing
│   └── feedback.py             # report_outcome (generic)
└── sync/
    ├── __init__.py
    └── claude_code.py          # sync_to_claude_agents, sync_to_claude_skills
```

#### draagon-forge Package (Programming Domain)

```
draagon_forge/
├── __init__.py
├── mcp/
│   ├── __init__.py
│   ├── server.py               # FastMCP entry with all tools
│   └── tools/
│       ├── __init__.py
│       ├── file_analysis.py    # analyze_code, analyze_diff, suggest_file_edits
│       ├── git.py              # Git-specific tools
│       ├── github.py           # GitHub integration tools
│       └── programming.py      # Programming-specific MCP tools
├── behaviors/
│   └── programming/            # Pre-built programming behaviors
│       ├── __init__.py
│       ├── code_review.py
│       ├── security.py
│       ├── performance.py
│       └── architecture.py
├── expertise/
│   ├── __init__.py
│   └── programming.py          # Programming domain expertise definitions
├── watchers/
│   ├── __init__.py
│   ├── file.py
│   ├── terminal.py
│   └── git.py
├── extension/                  # VS Code extension
│   ├── extension.ts
│   ├── panel/
│   └── mcp/
└── seed/
    ├── __init__.py
    └── claude_md.py            # CLAUDE.md parser
```

#### draagon-forge-health Package (Healthcare Domain)

```
draagon_forge_health/
├── __init__.py
├── mcp/
│   ├── __init__.py
│   ├── server.py               # FastMCP entry with healthcare tools
│   └── tools/
│       ├── __init__.py
│       ├── clinical.py         # analyze_diagnosis, patient_summary
│       ├── compliance.py       # check_hipaa, validate_consent
│       ├── protocols.py        # check_clinical_protocol
│       └── interop.py          # HL7/FHIR tools
├── behaviors/
│   └── healthcare/
│       ├── __init__.py
│       ├── clinical_review.py
│       ├── compliance.py
│       ├── documentation.py
│       └── diagnosis_support.py
├── expertise/
│   ├── __init__.py
│   └── healthcare.py           # Healthcare domain expertise definitions
└── seed/
    ├── __init__.py
    └── clinical_guidelines.py  # Seed from clinical guidelines
```

### REQ-031.3: Generic MCP Tool Pattern

Define the pattern for domain-agnostic MCP tools in draagon-ai-forge.

```python
# draagon_ai_forge/mcp/base.py

from abc import ABC, abstractmethod
from typing import TypeVar, Generic

T = TypeVar("T")


class DomainAnalyzer(ABC, Generic[T]):
    """Base class for domain-specific analyzers.

    Domain implementations provide:
    - Content analysis
    - Finding generation
    - Edit suggestions (if applicable)
    """

    @abstractmethod
    async def analyze(
        self,
        content: str,
        context: dict,
        analysis_type: str,
    ) -> T:
        """Analyze content and return domain-specific findings."""
        ...

    @abstractmethod
    def get_domains(self) -> list[str]:
        """Return list of supported domains."""
        ...


class BaseMCPToolProvider(ABC):
    """Base class for domain MCP tool providers.

    Provides common patterns:
    - Agent selection via TransactiveMemory
    - Context loading from beliefs
    - Outcome reporting
    """

    def __init__(
        self,
        transactive_memory: "TransactiveMemory",
        shared_memory: "SharedWorkingMemory",
        router: "CostOptimizedRouter",
    ):
        self.transactive_memory = transactive_memory
        self.shared_memory = shared_memory
        self.router = router

    async def select_agent_for_domain(self, domain: str) -> "Agent":
        """Select best agent for a domain using expertise routing."""
        experts = await self.transactive_memory.get_experts(
            topic=domain,
            min_confidence=0.5,
        )
        if experts:
            return await self._get_agent(experts[0][0])
        return await self._get_default_agent(domain)

    @abstractmethod
    async def _get_agent(self, agent_id: str) -> "Agent":
        """Get agent by ID - domain implements this."""
        ...

    @abstractmethod
    async def _get_default_agent(self, domain: str) -> "Agent":
        """Get default agent for domain - domain implements this."""
        ...
```

**Programming Implementation:**

```python
# draagon_forge/mcp/tools/file_analysis.py

from draagon_ai_forge.mcp.base import BaseMCPToolProvider, DomainAnalyzer


class ProgrammingAnalyzer(DomainAnalyzer[CodeAnalysisResult]):
    """Programming-specific content analyzer."""

    def get_domains(self) -> list[str]:
        return ["security", "performance", "architecture", "code-review", "testing"]

    async def analyze(
        self,
        content: str,
        context: dict,
        analysis_type: str,
    ) -> CodeAnalysisResult:
        # Programming-specific analysis
        ...


class ProgrammingMCPTools(BaseMCPToolProvider):
    """Programming domain MCP tools."""

    @mcp.tool()
    async def analyze_code(
        self,
        content: str,
        file_path: str,
        domain: str | None = None,
        analysis_type: str = "review",
    ) -> dict:
        """Programming-specific code analysis."""
        agent = await self.select_agent_for_domain(domain or analysis_type)
        # ... programming-specific implementation
```

**Healthcare Implementation:**

```python
# draagon_forge_health/mcp/tools/clinical.py

from draagon_ai_forge.mcp.base import BaseMCPToolProvider, DomainAnalyzer


class ClinicalAnalyzer(DomainAnalyzer[ClinicalAnalysisResult]):
    """Healthcare-specific content analyzer."""

    def get_domains(self) -> list[str]:
        return ["diagnosis", "treatment", "medication", "compliance", "documentation"]

    async def analyze(
        self,
        content: str,
        context: dict,
        analysis_type: str,
    ) -> ClinicalAnalysisResult:
        # Healthcare-specific analysis
        ...


class HealthcareMCPTools(BaseMCPToolProvider):
    """Healthcare domain MCP tools."""

    @mcp.tool()
    async def analyze_diagnosis(
        self,
        patient_data: str,
        symptoms: list[str],
        domain: str | None = None,
    ) -> dict:
        """Healthcare-specific diagnosis analysis."""
        agent = await self.select_agent_for_domain(domain or "diagnosis")
        # ... healthcare-specific implementation
```

### REQ-031.4: Shared Belief Types

Define belief types that span domains vs. domain-specific.

```python
# draagon_ai_forge/core/extensions.py

from enum import Enum


class ForgeBeliefType(str, Enum):
    """Generic belief types - applicable to any domain."""

    # From draagon-ai (inherited)
    HOUSEHOLD_FACT = "household_fact"
    VERIFIED_FACT = "verified_fact"
    UNVERIFIED_CLAIM = "unverified_claim"
    INFERRED = "inferred"
    USER_PREFERENCE = "user_preference"

    # Generic extensions (all domains)
    PRINCIPLE = "principle"      # High-level rules
    PATTERN = "pattern"          # Reusable approaches
    LEARNING = "learning"        # Extracted insights
    CONSTRAINT = "constraint"    # Limits/boundaries
    BEST_PRACTICE = "best_practice"  # Recommended approaches


# draagon_forge/core/extensions.py

class ProgrammingBeliefType(str, Enum):
    """Programming-specific belief types."""

    ARCHITECTURAL_RULE = "architectural_rule"
    CODE_PATTERN = "code_pattern"
    ANTI_PATTERN = "anti_pattern"
    TESTING_STRATEGY = "testing_strategy"
    SECURITY_RULE = "security_rule"
    PERFORMANCE_INSIGHT = "performance_insight"


# draagon_forge_health/core/extensions.py

class HealthcareBeliefType(str, Enum):
    """Healthcare-specific belief types."""

    CLINICAL_GUIDELINE = "clinical_guideline"
    TREATMENT_PROTOCOL = "treatment_protocol"
    CONTRAINDICATION = "contraindication"
    DRUG_INTERACTION = "drug_interaction"
    COMPLIANCE_REQUIREMENT = "compliance_requirement"
    DIAGNOSTIC_CRITERIA = "diagnostic_criteria"
```

### REQ-031.5: Domain Registration

Allow domains to register their capabilities.

```python
# draagon_ai_forge/domains/registry.py

from dataclasses import dataclass, field


@dataclass
class DomainDefinition:
    """Definition of a domain for Forge."""

    name: str                           # "programming", "healthcare"
    description: str
    belief_types: list[str]             # Domain-specific belief types
    expertise_areas: list[str]          # Areas for TransactiveMemory
    mcp_tool_prefix: str                # "code_", "clinical_"
    behaviors_package: str              # "draagon_forge.behaviors.programming"

    # Optional
    watchers: list[str] = field(default_factory=list)
    integrations: list[str] = field(default_factory=list)


class DomainRegistry:
    """Registry of available domains."""

    _domains: dict[str, DomainDefinition] = {}

    @classmethod
    def register(cls, domain: DomainDefinition) -> None:
        """Register a domain."""
        cls._domains[domain.name] = domain

    @classmethod
    def get(cls, name: str) -> DomainDefinition | None:
        """Get domain by name."""
        return cls._domains.get(name)

    @classmethod
    def list_domains(cls) -> list[str]:
        """List all registered domains."""
        return list(cls._domains.keys())

    @classmethod
    def get_belief_types(cls, domain: str) -> list[str]:
        """Get belief types for a domain."""
        d = cls._domains.get(domain)
        return d.belief_types if d else []


# Registration happens at package import
# draagon_forge/__init__.py
from draagon_ai_forge.domains.registry import DomainRegistry, DomainDefinition

DomainRegistry.register(DomainDefinition(
    name="programming",
    description="Software development assistance",
    belief_types=["architectural_rule", "code_pattern", "anti_pattern", ...],
    expertise_areas=["security", "performance", "architecture", "testing", ...],
    mcp_tool_prefix="code_",
    behaviors_package="draagon_forge.behaviors.programming",
    watchers=["file", "terminal", "git"],
    integrations=["github", "vscode"],
))
```

---

## Technical Design

### Dependency Graph

```
draagon-ai (PyPI)
    │
    └── draagon-ai-forge (PyPI)
            │
            ├── draagon-forge (PyPI)
            │       └── draagon-forge-dev (VS Code Extension)
            │
            └── draagon-forge-health (PyPI)
                    └── draagon-forge-health-ehr (EHR Extension)
```

### Installation

```bash
# For programming use case
pip install draagon-forge

# For healthcare use case
pip install draagon-forge-health

# For custom domain (use forge layer directly)
pip install draagon-ai-forge
```

### MCP Server Selection

Each domain provides its own MCP server entry point:

```json
// Programming domain
{
    "mcpServers": {
        "draagon-forge": {
            "command": "python",
            "args": ["-m", "draagon_forge.mcp.server"]
        }
    }
}

// Healthcare domain
{
    "mcpServers": {
        "draagon-forge-health": {
            "command": "python",
            "args": ["-m", "draagon_forge_health.mcp.server"]
        }
    }
}

// Multiple domains (advanced)
{
    "mcpServers": {
        "draagon-forge": {
            "command": "python",
            "args": ["-m", "draagon_forge.mcp.server"]
        },
        "draagon-forge-health": {
            "command": "python",
            "args": ["-m", "draagon_forge_health.mcp.server"]
        }
    }
}
```

---

## Migration Path

### Phase 1: Extract draagon-ai-forge

1. Create new package `draagon-ai-forge`
2. Move generic components from `draagon-forge`:
   - `core/extensions.py` → `draagon_ai_forge/core/extensions.py`
   - `llm/*` → `draagon_ai_forge/llm/`
   - Generic MCP tools → `draagon_ai_forge/mcp/`
3. Update `draagon-forge` to depend on `draagon-ai-forge`

### Phase 2: Refactor draagon-forge

1. Remove extracted components
2. Add `from draagon_ai_forge import ...` imports
3. Keep only programming-specific code
4. Update tests

### Phase 3: Create draagon-forge-health

1. Create new package depending on `draagon-ai-forge`
2. Implement healthcare-specific tools
3. Create healthcare behaviors
4. Add healthcare expertise definitions

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Code reuse | >70% | Shared code between domains |
| Package size | <5MB | Each domain package |
| Setup time | <5min | New domain from template |
| Independence | 100% | No cross-domain dependencies |

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| Protocol-Based Design | ✅ | DomainAnalyzer protocol |
| Async-First | ✅ | All I/O async |
| Don't Reinvent | ✅ | Layers build on each other |

---

## References

- [Python Package Structure Best Practices](https://packaging.python.org/)
- [Plugin Architecture Patterns](https://pluggy.readthedocs.io/)
- [draagon-ai Core](../draagon-ai/)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
