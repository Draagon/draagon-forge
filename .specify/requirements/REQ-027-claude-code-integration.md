# REQ-027: Claude Code Integration

**Priority:** P0
**Effort:** High (12 days)
**Dependencies:** REQ-001, REQ-022, REQ-023
**Blocks:** None

---

## Overview

Bridge Claude Code's native subagent/skill system with draagon-ai's sophisticated agent and behavior architecture. This creates a hybrid system where Claude Code provides the execution environment and draagon-ai provides the intelligence layer.

### The Integration Challenge

Claude Code and draagon-ai both have agent/behavior systems, but they serve different purposes:

| Aspect | Claude Code | draagon-ai |
|--------|-------------|------------|
| **Definition** | Markdown files with YAML | Python dataclasses (data, not code) |
| **Discovery** | File-based (`.claude/`) | Registry-based (`BehaviorRegistry`) |
| **Execution** | Claude's LLM + tools | Agent class with behaviors |
| **Routing** | Description matching | Expertise routing (`TransactiveMemory`) |
| **Learning** | None built-in | Continuous (expertise, evolution) |
| **Evolution** | Manual edits | Genetic algorithms |
| **Testing** | None built-in | Full test framework |
| **Coordination** | Isolated contexts | Shared memory |

### The Solution: Hybrid Architecture

**Claude Code provides:**
- Execution environment (LLM, tools, MCP)
- Discovery mechanism (files → activation)
- Isolation model (subagents for safety)
- User-facing slash commands

**draagon-ai provides:**
- Intelligence layer (expertise routing, learning)
- Evolution system (self-improving behaviors)
- Coordination layer (shared memory, beliefs)
- Behavior testing and validation

### Key Principle

> "Claude Code is the shell, draagon-ai is the brain."

Static subagents in `.claude/agents/` call draagon-ai MCP tools for intelligence. Dynamic routing via `delegate_to_expert()` leverages expertise tracking. Behaviors evolve and sync to Claude's discovery system.

---

## Requirements

### REQ-027.1: Agent/Behavior MCP Tools

Expose draagon-ai's agent system via MCP tools that Claude Code subagents can call.

```python
from draagon_ai.orchestration.agent import Agent, MultiAgent
from draagon_ai.orchestration.transactive_memory import TransactiveMemory
from draagon_ai.behaviors.registry import BehaviorRegistry

# Agent Selection Tools

@mcp.tool()
async def select_agent(
    query: str,
    domain: str | None = None,
    require_confidence: float = 0.5,
) -> dict:
    """Select the best draagon-ai agent for a query based on expertise.

    Uses TransactiveMemory to find the agent with highest expertise
    for the given query/domain combination.

    Args:
        query: The task or question
        domain: Optional domain hint (security, performance, etc.)
        require_confidence: Minimum expertise score required

    Returns:
        Selected agent info with expertise score
    """
    experts = await transactive_memory.get_experts(
        topic=domain or query,
        min_confidence=require_confidence,
    )

    if not experts:
        return {
            "agent": None,
            "reason": "No agent meets confidence threshold",
            "best_available": await get_best_available(query),
        }

    best_agent, score = experts[0]
    return {
        "agent_id": best_agent,
        "expertise_score": score,
        "behavior": await get_agent_behavior(best_agent),
        "all_candidates": [(a, s) for a, s in experts[:5]],
    }

@mcp.tool()
async def delegate_to_expert(
    task: str,
    domain: str | None = None,
    require_confidence: float = 0.6,
    report_findings: bool = True,
) -> dict:
    """Delegate a task to the best draagon-ai agent and execute it.

    Combines agent selection with execution. The selected agent runs
    with full draagon-ai capabilities (memory, learning, coordination).

    Args:
        task: The task to perform
        domain: Optional domain hint
        require_confidence: Minimum expertise score
        report_findings: Whether to publish observations to shared memory

    Returns:
        Agent response with findings and updated expertise
    """
    # 1. Select best agent
    selection = await select_agent(task, domain, require_confidence)

    if not selection["agent_id"]:
        return {"status": "no_expert", **selection}

    # 2. Execute with full draagon-ai context
    agent = await get_agent(selection["agent_id"])
    response = await agent.process(task)

    # 3. Update expertise based on outcome
    await transactive_memory.update_expertise(
        agent_id=selection["agent_id"],
        topic=domain or task,
        success=response.success,
    )

    # 4. Publish observations if requested
    if report_findings and response.observations:
        for obs in response.observations:
            await shared_memory.add_observation(
                content=obs.content,
                source_agent_id=selection["agent_id"],
                attention_weight=0.7,
                confidence=obs.confidence,
                is_belief_candidate=obs.is_belief_candidate,
            )

    return {
        "agent_id": selection["agent_id"],
        "result": response.content,
        "success": response.success,
        "observations": [o.to_dict() for o in response.observations],
        "expertise_after": await get_expertise_score(selection["agent_id"], domain),
    }

@mcp.tool()
async def get_expertise_scores(
    query: str,
    top_n: int = 5,
) -> dict:
    """Get expertise scores for all agents on a query.

    Useful for understanding which agents are available and
    their relative expertise levels.

    Args:
        query: The task or domain to check
        top_n: Number of top agents to return

    Returns:
        Ranked list of agents with expertise scores
    """
    all_agents = await registry.get_active_agents()
    scores = []

    for agent in all_agents:
        score = await transactive_memory.get_expertise_score(
            agent_id=agent.agent_id,
            query=query,
        )
        scores.append({
            "agent_id": agent.agent_id,
            "name": agent.name,
            "score": score,
            "behavior": agent.behavior.name if agent.behavior else None,
        })

    scores.sort(key=lambda x: x["score"], reverse=True)
    return {
        "query": query,
        "experts": scores[:top_n],
        "total_agents": len(all_agents),
    }
```

**Acceptance Criteria:**
- [ ] `select_agent` returns best agent by expertise
- [ ] `delegate_to_expert` executes and updates expertise
- [ ] `get_expertise_scores` shows all agent capabilities
- [ ] Expertise scores reflect actual success/failure history

### REQ-027.2: Behavior Management Tools

Expose draagon-ai's behavior system for creation, testing, and evolution.

```python
from draagon_ai.behaviors.types import Behavior, BehaviorTier, BehaviorStatus
from draagon_ai.behaviors.architect import BehaviorArchitect
from draagon_ai.behaviors.evolution import BehaviorEvolutionEngine
from draagon_ai.behaviors.testing import BehaviorTestRunner

@mcp.tool()
async def list_behaviors(
    tier: str | None = None,  # "CORE" | "ADDON" | "APPLICATION" | "GENERATED"
    status: str | None = None,  # "DRAFT" | "TESTING" | "ACTIVE" | "DEPRECATED"
    domain: str | None = None,
) -> dict:
    """List available behaviors with filtering.

    Behaviors are draagon-ai's equivalent of Claude skills, but with
    testing, evolution, and expertise tracking built in.

    Args:
        tier: Filter by behavior tier
        status: Filter by lifecycle status
        domain: Filter by domain

    Returns:
        List of behaviors matching filters
    """
    behaviors = await registry.get_behaviors(
        tier=BehaviorTier[tier] if tier else None,
        status=BehaviorStatus[status] if status else None,
    )

    return {
        "behaviors": [
            {
                "id": b.behavior_id,
                "name": b.name,
                "description": b.description,
                "tier": b.tier.value,
                "status": b.status.value,
                "actions": [a.name for a in b.actions],
                "is_evolvable": b.is_evolvable,
            }
            for b in behaviors
        ],
        "total": len(behaviors),
    }

@mcp.tool()
async def activate_behavior(
    query: str,
    context: dict | None = None,
) -> dict:
    """Activate the best behavior for a query.

    Unlike static Claude skills, behaviors are:
    - Semantically triggered (LLM evaluates, not regex)
    - Expertise-routed (best agent selected)
    - Self-improving (evolution based on outcomes)
    - Tested (validated before activation)

    Args:
        query: The user's request
        context: Additional context (user_id, session, etc.)

    Returns:
        Activated behavior with guidance
    """
    # 1. Find matching behaviors via semantic triggers
    candidates = await registry.find_by_trigger(query, context)

    if not candidates:
        return {"status": "no_match", "query": query}

    # 2. Select best based on expertise
    best = candidates[0]
    expertise = await transactive_memory.get_expertise_score(
        agent_id=best.behavior_id,
        query=query,
    )

    # 3. Return activation context
    return {
        "behavior_id": best.behavior_id,
        "name": best.name,
        "description": best.description,
        "actions": [
            {"name": a.name, "description": a.description}
            for a in best.actions
        ],
        "decision_prompt": best.prompts.decision_prompt,
        "constraints": {
            "forbidden_actions": best.constraints.forbidden_actions,
            "required_confirmations": best.constraints.required_confirmations,
            "max_actions_per_turn": best.constraints.max_actions_per_turn,
        },
        "expertise_score": expertise,
    }

@mcp.tool()
async def create_behavior(
    name: str,
    description: str,
    domain: str,
    based_on: str | None = None,
    auto_research: bool = True,
) -> dict:
    """Create a new behavior via the Behavior Architect.

    This is draagon-ai's equivalent of creating a Claude skill,
    but with automatic research, test generation, and evolution support.

    Args:
        name: Behavior name
        description: What the behavior does
        domain: Domain area (security, testing, etc.)
        based_on: Optional existing behavior to extend
        auto_research: Whether to research the domain first

    Returns:
        Created behavior in DRAFT status
    """
    architect = BehaviorArchitect(llm=llm, registry=registry)

    # 1. Optional domain research
    research = None
    if auto_research:
        research = await architect.research_domain(domain, depth="medium")

    # 2. Create behavior
    behavior = await architect.create_behavior(
        name=name,
        description=description,
        domain=domain,
        research=research,
        based_on=based_on,
    )

    # 3. Auto-generate initial test cases
    tests = await architect.generate_tests(behavior.behavior_id, count=10)

    return {
        "behavior_id": behavior.behavior_id,
        "name": behavior.name,
        "tier": "GENERATED",
        "status": "DRAFT",
        "actions": [a.name for a in behavior.actions],
        "test_cases": len(tests),
        "next_steps": [
            "Run tests with run_behavior_tests()",
            "Evolve with evolve_behavior() if needed",
            "Promote with promote_behavior() when ready",
        ],
    }

@mcp.tool()
async def run_behavior_tests(
    behavior_id: str,
) -> dict:
    """Run tests for a behavior.

    Validates the behavior against its test cases before
    it can be promoted to higher status levels.

    Args:
        behavior_id: The behavior to test

    Returns:
        Test results with pass/fail details
    """
    behavior = await registry.get(behavior_id)
    runner = BehaviorTestRunner(llm=llm)

    results = await runner.run_tests(behavior)

    return {
        "behavior_id": behavior_id,
        "total_tests": results.total_tests,
        "passed": results.passed,
        "failed": results.failed,
        "pass_rate": results.pass_rate,
        "duration_seconds": results.duration_seconds,
        "can_promote": results.pass_rate >= 0.8,
        "failures": [
            {"test": t, "reason": r}
            for t, r in results.failures.items()
        ][:5],  # Top 5 failures
    }

@mcp.tool()
async def evolve_behavior(
    behavior_id: str,
    generations: int = 5,
    require_approval: bool = True,
) -> dict:
    """Evolve a behavior using genetic algorithms.

    Automatically improves the behavior's prompts and triggers
    based on test case performance.

    Args:
        behavior_id: The behavior to evolve
        generations: Number of evolution generations
        require_approval: Whether to require manual approval

    Returns:
        Evolution results with before/after fitness
    """
    behavior = await registry.get(behavior_id)
    engine = BehaviorEvolutionEngine(llm=llm)

    result = await engine.evolve(
        behavior=behavior,
        generations=generations,
        require_manual_approval=require_approval,
    )

    return {
        "behavior_id": behavior_id,
        "original_fitness": result.original_fitness,
        "evolved_fitness": result.evolved_fitness,
        "improvement": result.evolved_fitness - result.original_fitness,
        "generations_run": result.generations_run,
        "approved": result.approved,
        "mutations_applied": result.mutations_applied,
        "best_variant_id": result.best_variant.behavior_id if result.best_variant else None,
    }

@mcp.tool()
async def promote_behavior(
    behavior_id: str,
    new_status: str,  # "TESTING" | "STAGING" | "ACTIVE"
    reason: str | None = None,
) -> dict:
    """Promote a behavior to a higher status level.

    Behaviors progress: DRAFT → TESTING → STAGING → ACTIVE

    Args:
        behavior_id: The behavior to promote
        new_status: Target status level
        reason: Optional promotion reason

    Returns:
        Updated behavior status
    """
    behavior = await registry.get(behavior_id)
    target = BehaviorStatus[new_status]

    # Validate progression
    valid_transitions = {
        BehaviorStatus.DRAFT: [BehaviorStatus.TESTING],
        BehaviorStatus.TESTING: [BehaviorStatus.STAGING, BehaviorStatus.DRAFT],
        BehaviorStatus.STAGING: [BehaviorStatus.ACTIVE, BehaviorStatus.TESTING],
        BehaviorStatus.ACTIVE: [BehaviorStatus.DEPRECATED],
    }

    if target not in valid_transitions.get(behavior.status, []):
        return {
            "error": f"Cannot transition from {behavior.status.value} to {new_status}",
            "valid_transitions": [s.value for s in valid_transitions.get(behavior.status, [])],
        }

    # Check requirements
    if target == BehaviorStatus.ACTIVE:
        results = await run_behavior_tests(behavior_id)
        if results["pass_rate"] < 0.8:
            return {
                "error": "Cannot promote to ACTIVE with pass rate < 80%",
                "current_pass_rate": results["pass_rate"],
            }

    # Promote
    behavior.status = target
    await registry.save_behavior(behavior)

    return {
        "behavior_id": behavior_id,
        "previous_status": behavior.status.value,
        "new_status": new_status,
        "reason": reason,
    }
```

**Acceptance Criteria:**
- [ ] `list_behaviors` shows all behaviors with filters
- [ ] `activate_behavior` finds and activates matching behavior
- [ ] `create_behavior` generates new behavior with tests
- [ ] `run_behavior_tests` validates behavior
- [ ] `evolve_behavior` improves behavior automatically
- [ ] `promote_behavior` enforces status progression

### REQ-027.3: Claude Code Sync Tools

Sync draagon-ai behaviors to Claude Code's discovery system.

```python
from pathlib import Path
import yaml

CLAUDE_AGENTS_DIR = Path(".claude/agents")
CLAUDE_SKILLS_DIR = Path(".claude/skills")

@mcp.tool()
async def sync_to_claude_agents(
    behavior_ids: list[str] | None = None,
    status_filter: str = "ACTIVE",
) -> dict:
    """Generate Claude Code subagent files from draagon-ai behaviors.

    Converts draagon-ai behaviors to .claude/agents/ markdown files
    that Claude Code can discover and spawn as subagents.

    Args:
        behavior_ids: Specific behaviors to sync (None = all matching)
        status_filter: Only sync behaviors with this status

    Returns:
        Sync results with created/updated files
    """
    behaviors = await registry.get_behaviors(
        status=BehaviorStatus[status_filter] if status_filter else None,
    )

    if behavior_ids:
        behaviors = [b for b in behaviors if b.behavior_id in behavior_ids]

    CLAUDE_AGENTS_DIR.mkdir(parents=True, exist_ok=True)

    created = []
    updated = []

    for behavior in behaviors:
        filename = f"{behavior.name.lower().replace(' ', '-')}.md"
        filepath = CLAUDE_AGENTS_DIR / filename

        content = generate_subagent_markdown(behavior)

        if filepath.exists():
            updated.append(filename)
        else:
            created.append(filename)

        filepath.write_text(content)

    return {
        "synced": len(behaviors),
        "created": created,
        "updated": updated,
        "directory": str(CLAUDE_AGENTS_DIR),
    }

def generate_subagent_markdown(behavior: Behavior) -> str:
    """Generate Claude Code subagent markdown from behavior."""

    # Map behavior to subagent tools
    tools = ["Read", "Grep", "Glob"]  # Default read-only
    if any(a.name.startswith("write") or a.name.startswith("edit") for a in behavior.actions):
        tools.extend(["Write", "Edit"])
    if any(a.name.startswith("bash") or a.name.startswith("run") for a in behavior.actions):
        tools.append("Bash")

    frontmatter = {
        "name": behavior.name.lower().replace(" ", "-"),
        "description": behavior.description,
        "tools": ", ".join(tools),
        "model": "sonnet",
    }

    # Add hooks for feedback
    frontmatter["hooks"] = {
        "Stop": [{
            "type": "command",
            "command": f"python -m draagon_forge.cli report_outcome --behavior={behavior.behavior_id} --success=$SUCCESS",
        }]
    }

    yaml_block = yaml.dump(frontmatter, default_flow_style=False)

    body = f"""
# {behavior.name}

{behavior.description}

## Context Loading

Before starting, load relevant context from draagon-ai:

1. Call `search_context("{behavior.domain or 'general'}")` for relevant beliefs
2. Call `query_beliefs(domain="{behavior.domain}")` for domain principles
3. Call `discover_observations(domain="{behavior.domain}")` for recent findings

## Available Actions

{chr(10).join(f"- **{a.name}**: {a.description}" for a in behavior.actions)}

## Constraints

{chr(10).join(f"- {c}" for c in behavior.constraints.forbidden_actions) if behavior.constraints.forbidden_actions else "No specific constraints."}

## After Completion

Report your findings:
1. Call `publish_observation(content="...", observation_type="fact|warning|decision", domain="{behavior.domain}")`
2. The Stop hook will automatically report success/failure to update expertise

## Domain Knowledge

{behavior.domain_context or "No specific domain context provided."}
"""

    return f"---\n{yaml_block}---\n{body}"

@mcp.tool()
async def sync_to_claude_skills(
    behavior_ids: list[str] | None = None,
    status_filter: str = "ACTIVE",
) -> dict:
    """Generate Claude Code skill directories from draagon-ai behaviors.

    Converts draagon-ai behaviors to .claude/skills/ directories
    that Claude Code can discover and invoke as skills.

    Skills are appropriate for:
    - Knowledge/guidance (not requiring isolation)
    - Advisory capabilities
    - Information retrieval

    Args:
        behavior_ids: Specific behaviors to sync
        status_filter: Only sync behaviors with this status

    Returns:
        Sync results with created/updated skills
    """
    behaviors = await registry.get_behaviors(
        status=BehaviorStatus[status_filter] if status_filter else None,
    )

    if behavior_ids:
        behaviors = [b for b in behaviors if b.behavior_id in behavior_ids]

    # Filter to behaviors suitable for skills (advisory, not action-heavy)
    skill_behaviors = [
        b for b in behaviors
        if len(b.actions) <= 3 or b.tier == BehaviorTier.CORE
    ]

    created = []
    updated = []

    for behavior in skill_behaviors:
        skill_name = behavior.name.lower().replace(" ", "-")
        skill_dir = CLAUDE_SKILLS_DIR / skill_name
        skill_dir.mkdir(parents=True, exist_ok=True)

        skill_md = generate_skill_markdown(behavior)
        skill_path = skill_dir / "SKILL.md"

        if skill_path.exists():
            updated.append(skill_name)
        else:
            created.append(skill_name)

        skill_path.write_text(skill_md)

    return {
        "synced": len(skill_behaviors),
        "created": created,
        "updated": updated,
        "directory": str(CLAUDE_SKILLS_DIR),
        "skipped": len(behaviors) - len(skill_behaviors),
        "skipped_reason": "Too many actions for skill format",
    }

def generate_skill_markdown(behavior: Behavior) -> str:
    """Generate Claude Code skill markdown from behavior."""

    frontmatter = {
        "name": behavior.name.lower().replace(" ", "-"),
        "description": behavior.description,
        "user-invocable": True,
    }

    yaml_block = yaml.dump(frontmatter, default_flow_style=False)

    body = f"""
# {behavior.name}

{behavior.description}

## When to Use

This skill is triggered when:
{chr(10).join(f"- {t.description}" for t in behavior.triggers[:3])}

## How to Use

{behavior.prompts.decision_prompt if behavior.prompts else "Follow the behavior's actions as appropriate."}

## Available MCP Tools

Call these draagon-ai tools for intelligence:

- `search_context(query)` - Semantic search for relevant beliefs
- `query_beliefs(domain="{behavior.domain}")` - Get domain principles
- `activate_behavior(query)` - Get full behavior guidance

## Domain Knowledge

{behavior.domain_context or "Refer to the codebase's CLAUDE.md for domain knowledge."}
"""

    return f"---\n{yaml_block}---\n{body}"

@mcp.tool()
async def get_sync_status() -> dict:
    """Get the current sync status between draagon-ai and Claude Code.

    Shows which behaviors are synced, out of date, or missing
    from Claude Code's discovery directories.

    Returns:
        Sync status for agents and skills
    """
    behaviors = await registry.get_behaviors(status=BehaviorStatus.ACTIVE)

    agent_files = list(CLAUDE_AGENTS_DIR.glob("*.md")) if CLAUDE_AGENTS_DIR.exists() else []
    skill_dirs = list(CLAUDE_SKILLS_DIR.iterdir()) if CLAUDE_SKILLS_DIR.exists() else []

    behavior_names = {b.name.lower().replace(" ", "-") for b in behaviors}
    agent_names = {f.stem for f in agent_files}
    skill_names = {d.name for d in skill_dirs if d.is_dir()}

    return {
        "behaviors": {
            "total_active": len(behaviors),
            "names": list(behavior_names),
        },
        "agents": {
            "total_files": len(agent_files),
            "synced": list(behavior_names & agent_names),
            "missing": list(behavior_names - agent_names),
            "orphaned": list(agent_names - behavior_names),
        },
        "skills": {
            "total_dirs": len(skill_dirs),
            "synced": list(behavior_names & skill_names),
            "missing": list(behavior_names - skill_names),
            "orphaned": list(skill_names - behavior_names),
        },
    }
```

**Acceptance Criteria:**
- [ ] `sync_to_claude_agents` creates valid subagent files
- [ ] `sync_to_claude_skills` creates valid skill directories
- [ ] Generated subagents call draagon-ai MCP tools
- [ ] Generated subagents have feedback hooks
- [ ] `get_sync_status` shows sync state accurately

### REQ-027.4: File Access Architecture

Define how Claude Code subagents and draagon-ai share file operations.

#### Key Principle

> **Claude Code handles file I/O, draagon-ai handles semantic analysis.**

Claude Code subagents have direct access to file tools (Read, Write, Edit, Glob, Grep). draagon-ai agents analyze content passed via MCP and return structured suggestions. This separation ensures:

1. **Security**: File access is managed by Claude Code's permission system
2. **Simplicity**: draagon-ai doesn't need filesystem access
3. **Flexibility**: Analysis is decoupled from I/O

#### File Access Pattern

```python
@mcp.tool()
async def analyze_code(
    content: str,
    file_path: str,
    domain: str | None = None,
    analysis_type: str = "review",  # "review" | "security" | "performance" | "architecture"
) -> dict:
    """Analyze code content and return structured suggestions.

    Claude Code reads the file, passes content here for analysis.
    Returns suggestions that Claude Code can apply.

    Args:
        content: The file content to analyze
        file_path: Original path (for context)
        domain: Domain hint for agent selection
        analysis_type: Type of analysis to perform

    Returns:
        Analysis results with suggested edits
    """
    # 1. Select best agent for this analysis
    agent = await select_agent_for_domain(domain or analysis_type)

    # 2. Load relevant beliefs/patterns
    context = await search_context(
        query=f"{analysis_type} {domain or 'general'}",
        limit=10,
    )

    # 3. Perform analysis
    analysis = await agent.analyze(
        content=content,
        file_path=file_path,
        context=context,
        analysis_type=analysis_type,
    )

    # 4. Return structured suggestions
    return {
        "file_path": file_path,
        "findings": [
            {
                "type": f.finding_type,  # "issue" | "suggestion" | "warning"
                "severity": f.severity,  # "critical" | "high" | "medium" | "low"
                "line_start": f.line_start,
                "line_end": f.line_end,
                "message": f.message,
                "reasoning": f.reasoning,
            }
            for f in analysis.findings
        ],
        "suggested_edits": [
            {
                "old_string": e.old_string,
                "new_string": e.new_string,
                "reason": e.reason,
                "confidence": e.confidence,
            }
            for e in analysis.suggested_edits
        ],
        "agent_id": agent.agent_id,
        "expertise_score": agent.expertise_score,
    }

@mcp.tool()
async def analyze_diff(
    diff: str,
    base_path: str,
    domain: str | None = None,
) -> dict:
    """Analyze a git diff for issues.

    Claude Code generates the diff, passes it here for review.
    Useful for pre-commit hooks and PR reviews.

    Args:
        diff: The git diff content
        base_path: Repository base path
        domain: Domain hint

    Returns:
        Analysis of the changes
    """
    agent = await select_agent_for_domain("code-review")

    # Parse diff to understand changes
    changes = parse_diff(diff)

    # Analyze each changed file
    findings = []
    for change in changes:
        result = await agent.analyze_change(
            file_path=change.file_path,
            additions=change.additions,
            deletions=change.deletions,
            context=change.context_lines,
        )
        findings.extend(result.findings)

    return {
        "files_analyzed": len(changes),
        "total_findings": len(findings),
        "findings": [f.to_dict() for f in findings],
        "summary": await agent.summarize_findings(findings),
        "should_block": any(f.severity == "critical" for f in findings),
    }

@mcp.tool()
async def suggest_file_edits(
    task_description: str,
    file_contents: dict[str, str],  # path -> content
    domain: str | None = None,
) -> dict:
    """Given a task and file contents, suggest edits to implement it.

    Claude Code reads files and passes contents. draagon-ai suggests
    the edits. Claude Code applies them.

    Args:
        task_description: What needs to be done
        file_contents: Map of file paths to their contents
        domain: Domain hint

    Returns:
        Suggested edits per file
    """
    agent = await select_agent_for_domain(domain or "development")

    # Plan the implementation
    plan = await agent.plan_implementation(
        task=task_description,
        files=file_contents,
    )

    # Generate edits for each file
    edits_by_file = {}
    for file_path, content in file_contents.items():
        if file_path in plan.files_to_modify:
            edits = await agent.generate_edits(
                file_path=file_path,
                content=content,
                instructions=plan.instructions_for_file(file_path),
            )
            edits_by_file[file_path] = [
                {
                    "old_string": e.old_string,
                    "new_string": e.new_string,
                    "reason": e.reason,
                }
                for e in edits
            ]

    return {
        "task": task_description,
        "plan_summary": plan.summary,
        "files_to_modify": list(edits_by_file.keys()),
        "edits": edits_by_file,
        "new_files_suggested": plan.new_files,
    }
```

#### Workflow: Claude Code + draagon-ai File Operations

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         CLAUDE CODE (Shell)                               │
│  1. User asks: "Review the auth module for security issues"               │
│                                                                           │
│  2. Claude reads files:                                                   │
│     contents = Read("src/auth/*.py")                                      │
│                                                                           │
│  3. Claude calls MCP tool:                                                │
│     result = analyze_code(                                                │
│         content=contents["src/auth/login.py"],                            │
│         file_path="src/auth/login.py",                                    │
│         domain="security",                                                │
│         analysis_type="security"                                          │
│     )                                                                     │
│                                                                           │
│  4. Claude applies suggested edits:                                       │
│     for edit in result["suggested_edits"]:                                │
│         Edit(                                                             │
│             file_path="src/auth/login.py",                                │
│             old_string=edit["old_string"],                                │
│             new_string=edit["new_string"]                                 │
│         )                                                                 │
│                                                                           │
│  5. Claude reports outcome:                                               │
│     report_outcome(agent_id=result["agent_id"], success=True, ...)        │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ MCP Protocol
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      DRAAGON-AI (Brain via MCP)                           │
│                                                                           │
│  analyze_code():                                                          │
│    1. Select security expert agent (TransactiveMemory)                    │
│    2. Load security beliefs/patterns (search_context)                     │
│    3. Analyze content with agent (LLM-based, not regex)                   │
│    4. Return structured findings + suggested edits                        │
│                                                                           │
│  (No file system access - receives content, returns analysis)             │
└──────────────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria:**
- [ ] `analyze_code` returns structured findings and edits
- [ ] `analyze_diff` works with git diff output
- [ ] `suggest_file_edits` plans multi-file changes
- [ ] All tools receive content, not file paths to read
- [ ] Suggested edits are in Claude Code Edit tool format

### REQ-027.5: Outcome Reporting and Learning

Close the feedback loop between Claude Code execution and draagon-ai learning.

```python
@mcp.tool()
async def report_outcome(
    agent_id: str | None = None,
    behavior_id: str | None = None,
    success: bool = True,
    findings: list[str] | None = None,
    domain: str | None = None,
    error: str | None = None,
) -> dict:
    """Report task outcome to update expertise and publish learnings.

    Called by Claude Code subagents (via Stop hook) or manually
    to feed results back into draagon-ai's learning system.

    Args:
        agent_id: The agent that performed the task
        behavior_id: The behavior that was used
        success: Whether the task succeeded
        findings: Key observations/learnings
        domain: Domain area for expertise tracking
        error: Error message if failed

    Returns:
        Updated expertise and published observations
    """
    # 1. Update expertise
    expertise_update = None
    if agent_id and domain:
        expertise_update = await transactive_memory.update_expertise(
            agent_id=agent_id,
            topic=domain,
            success=success,
        )

    # 2. Publish findings as observations
    published = []
    if findings:
        for finding in findings:
            obs = await shared_memory.add_observation(
                content=finding,
                source_agent_id=agent_id or "claude-subagent",
                attention_weight=0.7 if success else 0.5,
                confidence=0.8 if success else 0.5,
                is_belief_candidate=success,  # Only successful findings become belief candidates
                belief_type="fact" if success else "warning",
            )
            published.append(obs.observation_id)

    # 3. Log error if failed
    if not success and error:
        await shared_memory.add_observation(
            content=f"Task failed: {error}",
            source_agent_id=agent_id or "claude-subagent",
            attention_weight=0.6,
            confidence=0.9,  # We're confident about failures
            is_belief_candidate=False,
            belief_type="warning",
        )

    # 4. Publish to learning channel
    if success and findings:
        for finding in findings:
            await learning_channel.publish(
                Learning(
                    content=finding,
                    learning_type=LearningType.INSIGHT,
                    scope=LearningScope.CONTEXT,
                    source_agent_id=agent_id,
                    confidence=0.8,
                )
            )

    return {
        "reported": True,
        "success": success,
        "expertise_update": {
            "agent_id": agent_id,
            "domain": domain,
            "new_score": expertise_update.confidence if expertise_update else None,
        } if expertise_update else None,
        "observations_published": published,
        "learnings_published": len(findings) if findings and success else 0,
    }

@mcp.tool()
async def report_behavior_feedback(
    behavior_id: str,
    query: str,
    success: bool,
    actual_actions: list[str],
    expected_actions: list[str] | None = None,
    user_feedback: str | None = None,
) -> dict:
    """Report feedback on a behavior's performance for evolution.

    Feeds into the behavior's test suite and evolution engine.

    Args:
        behavior_id: The behavior that was used
        query: The original query
        success: Whether it produced good results
        actual_actions: Actions that were taken
        expected_actions: Actions that should have been taken
        user_feedback: Optional user commentary

    Returns:
        Feedback recorded status
    """
    behavior = await registry.get(behavior_id)

    # Create test case from feedback
    test_case = BehaviorTestCase(
        test_id=f"feedback-{datetime.now().isoformat()}",
        name=f"User feedback: {query[:50]}",
        description=user_feedback or "Auto-generated from usage feedback",
        user_query=query,
        context={},
        expected_actions=expected_actions or actual_actions,
        expected_response_contains=[],
        expected_response_excludes=[],
        forbidden_actions=[],
        priority="medium",
        tags=["user-feedback", "auto-generated"],
    )

    # Add to behavior's test suite
    behavior.test_cases.append(test_case)
    await registry.save_behavior(behavior)

    # Update behavior metrics
    behavior.metrics.activation_count += 1
    if success:
        behavior.metrics.success_count += 1

    return {
        "behavior_id": behavior_id,
        "feedback_recorded": True,
        "test_case_created": test_case.test_id,
        "success_rate": behavior.metrics.success_rate,
        "evolution_recommended": behavior.metrics.success_rate < 0.7,
    }
```

**Acceptance Criteria:**
- [ ] `report_outcome` updates expertise correctly
- [ ] `report_outcome` publishes findings to shared memory
- [ ] `report_outcome` feeds learning channel
- [ ] `report_behavior_feedback` creates test cases
- [ ] Feedback influences behavior evolution

---

## Technical Design

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLAUDE CODE LAYER                                  │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────────┐  │
│  │ .claude/agents/      │  │ .claude/skills/      │  │ .claude/commands/ │  │
│  │ (Generated from      │  │ (Generated from      │  │ (User slash       │  │
│  │  draagon-ai behaviors│  │  draagon-ai behaviors│  │  commands)        │  │
│  │  via sync_to_*)      │  │  via sync_to_*)      │  │                   │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  └─────────┬─────────┘  │
│             │ Calls MCP tools          │                       │            │
│             ▼                          ▼                       ▼            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │              Claude (spawns subagents, invokes skills)               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                        │ MCP Protocol
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DRAAGON FORGE MCP SERVER                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  REQ-027 Tools (Claude Code Integration)                             │  │
│  │  ├── select_agent()          - Route by expertise                    │  │
│  │  ├── delegate_to_expert()    - Execute with learning                 │  │
│  │  ├── get_expertise_scores()  - Show all capabilities                 │  │
│  │  ├── list_behaviors()        - Query behavior registry               │  │
│  │  ├── activate_behavior()     - Get behavior guidance                 │  │
│  │  ├── create_behavior()       - Generate new behavior                 │  │
│  │  ├── run_behavior_tests()    - Validate behavior                     │  │
│  │  ├── evolve_behavior()       - Improve via genetics                  │  │
│  │  ├── promote_behavior()      - Advance status                        │  │
│  │  ├── sync_to_claude_agents() - Generate subagent files               │  │
│  │  ├── sync_to_claude_skills() - Generate skill directories            │  │
│  │  ├── get_sync_status()       - Check sync state                      │  │
│  │  ├── analyze_code()          - Analyze content, return edits         │  │
│  │  ├── analyze_diff()          - Review git diff for issues            │  │
│  │  ├── suggest_file_edits()    - Plan multi-file changes               │  │
│  │  ├── report_outcome()        - Feed back results                     │  │
│  │  └── report_behavior_feedback() - Improve via feedback               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  REQ-001 Tools (Core)     │  REQ-022 Tools (Multi-Agent)             │  │
│  │  - search_context         │  - publish_observation                   │  │
│  │  - query_beliefs          │  - discover_observations                 │  │
│  │  - add_belief             │  - find_expert_agent                     │  │
│  │  - adjust_belief          │  - record_agent_success                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DRAAGON-AI CORE                                   │
│  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────────────┐  │
│  │ Agent System       │  │ Behavior System    │  │ Multi-Agent Coord    │  │
│  │ - Agent            │  │ - Behavior         │  │ - TransactiveMemory  │  │
│  │ - MultiAgent       │  │ - BehaviorRegistry │  │ - SharedWorkingMem   │  │
│  │ - AgentContext     │  │ - BehaviorArchitect│  │ - LearningChannel    │  │
│  │                    │  │ - EvolutionEngine  │  │ - LearningOrchestrator│
│  │                    │  │ - TestRunner       │  │                      │  │
│  └────────────────────┘  └────────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/draagon_forge/mcp/tools/
├── __init__.py
├── agents.py           # REQ-027.1: select_agent, delegate_to_expert
├── behaviors.py        # REQ-027.2: list_behaviors, create_behavior, evolve
├── claude_sync.py      # REQ-027.3: sync_to_claude_agents, sync_to_claude_skills
├── file_analysis.py    # REQ-027.4: analyze_code, analyze_diff, suggest_file_edits
└── feedback.py         # REQ-027.5: report_outcome, report_behavior_feedback
```

### Workflow: Creating a New Agent via Conversation

```
User: "I need an agent that reviews database migrations for safety issues"

Claude: I'll create a new behavior for this using draagon-ai.

1. [Calls create_behavior(name="migration-reviewer", domain="database")]
   → Creates behavior in DRAFT status with 10 auto-generated tests

2. [Calls run_behavior_tests(behavior_id)]
   → Shows 7/10 tests passing (70%)

3. [Calls evolve_behavior(behavior_id, generations=5)]
   → Evolves to 9/10 tests passing (90%)

4. [Calls promote_behavior(behavior_id, "TESTING")]
   → Behavior now in TESTING status

5. [Calls sync_to_claude_agents()]
   → Creates .claude/agents/migration-reviewer.md

Claude: I've created a migration-reviewer agent. It's now available as a subagent.
You can test it by asking me to review a migration, or spawn it directly.
```

---

## Testing

### Unit Tests

- Test agent selection by expertise
- Test behavior creation and validation
- Test sync file generation
- Test outcome reporting

### Integration Tests

- Test full flow: create → test → evolve → sync
- Test subagent invocation of MCP tools
- Test feedback loop (outcome → expertise → routing)

### Acceptance Tests

- User can create agent via conversation
- Created agents appear in Claude Code
- Agents improve based on usage feedback
- Expertise routing selects correct agents

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Behavior creation success | >80% | Behaviors that reach ACTIVE status |
| Sync accuracy | 100% | Generated files match behaviors |
| Expertise routing accuracy | >75% | Best agent selected for domain |
| Feedback loop latency | <5s | Time from outcome to expertise update |
| Evolution improvement | >20% | Fitness gain from evolution |

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Semantic triggers, not regex |
| XML Output Format | ✅ | LLM prompts use XML |
| Protocol-Based Design | ✅ | MCP tools, behavior contracts |
| Async-First Processing | ✅ | All I/O async |
| Test Outcomes | ✅ | Behavior testing framework |

---

## References

- [Claude Code Subagents Documentation](https://code.claude.com/docs/en/sub-agents.md)
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills.md)
- [draagon-ai Behavior System Design](../draagon-ai/docs/design/BEHAVIOR_SYSTEM_DESIGN.md)
- [draagon-ai TransactiveMemory](../draagon-ai/orchestration/transactive_memory.py)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
