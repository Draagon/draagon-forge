# REQ-029: Account, Usage Tracking & Knowledge Ecosystem

**Priority:** P0-P2 (Phased)
**Status:** Draft
**Created:** 2026-01-13
**Dependencies:** REQ-028 (Sidebar/Inspector), draagon-ai (identity, ingestion, scopes)

---

## Overview

This specification covers three interconnected capabilities that transform Draagon Forge from a development tool into an intelligent knowledge ecosystem:

1. **Account & Identity** - Who you are, your organization, Claude credentials
2. **Usage & Cost Tracking** - Token consumption, model usage, session metrics
3. **Knowledge Ecosystem** - GitHub monitoring, document ingestion, belief population

These build on existing draagon-ai infrastructure (IdentityManager, HierarchicalScope, DocumentIngestionOrchestrator) and extend Forge's sidebar with actionable intelligence.

---

## Value Analysis & Prioritization

| Feature | Value | Complexity | Dependencies | Phase |
|---------|-------|------------|--------------|-------|
| Claude Account Info | High - trust/transparency | Low | ~/.claude.json | **Phase 1** |
| Draagon User Identity | High - personalization | Low | draagon-ai identity | **Phase 1** |
| Session Token Usage | High - cost awareness | Medium | LLM providers | **Phase 2** |
| Model Usage Display | Medium - transparency | Low | ModelRouter | **Phase 2** |
| Historical Usage | Medium - budgeting | Medium | Persistence | **Phase 3** |
| Knowledge Import (Manual) | High - bootstrap beliefs | Medium | DocumentIngestion | **Phase 3** |
| GitHub Repo Monitoring | Very High - killer feature | High | GitHub API, webhooks | **Phase 4** |
| Multi-Account Switching | Medium - team support | Medium | Scope hierarchy | **Phase 5** |
| Org/Team Hierarchy | Medium - enterprise | High | Permission system | **Phase 5** |

---

## Phase 1: Account & Identity Display (P0)

**Goal:** Show who the user is across both Claude Code and Draagon systems.

### 1.1 Account View Provider

New sidebar section showing:

```
┌─────────────────────────────────────────────────────────────┐
│  👤 Account                                      [Refresh]  │
├─────────────────────────────────────────────────────────────┤
│  CLAUDE CODE                                                │
│  ──────────────────────────────────────────────────────────│
│  👤 Doug Mealing                                           │
│  📧 doug@example.com                                       │
│  🏢 Personal                                               │
│  🔐 OAuth                         ⭐ Subscription Active   │
│  📊 Sessions: 1,234              💬 Prompts: 45,678       │
│                                                             │
│  DRAAGON FORGE                                              │
│  ──────────────────────────────────────────────────────────│
│  🔥 User: doug                                              │
│  🤖 Agent: draagon-forge                                   │
│  📁 Project: draagon-forge                                 │
│  🧠 Memories: 47          💡 Beliefs: 23                   │
│                                                             │
│  [Open Claude] [Switch Account]                            │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Data Sources

**Claude Code Account** (from `~/.claude.json`):
```typescript
interface ClaudeAccountInfo {
    authenticated: boolean;
    authType: 'oauth' | 'api_key' | 'none';
    email?: string;
    displayName?: string;
    organizationName?: string;
    organizationRole?: string;
    hasSubscription?: boolean;
    hasExtraUsage?: boolean;  // Extra usage credits
    numStartups?: number;     // Session count
    promptCount?: number;     // Total prompts
    memberSince?: string;
}
```

**Draagon Identity** (from draagon-ai):
```python
# From draagon_ai.cognition.identity
class UserInteractionPreferences:
    user_id: str
    verbosity_preference: float
    formality_level: float
    # ... personalization data

# From draagon_forge.mcp.config
config.user_id      # Unix username
config.agent_id     # "draagon-forge"
config.project_name # Current project
```

### 1.3 API Endpoints

```python
@router.get("/account/claude")
async def get_claude_account() -> ClaudeAccountInfo:
    """Read Claude Code account from ~/.claude.json"""

@router.get("/account/forge")
async def get_forge_account() -> ForgeAccountInfo:
    """Get Draagon Forge identity and stats"""
    return {
        "user_id": config.user_id,
        "agent_id": config.agent_id,
        "project_name": config.project_name,
        "memory_count": await memory.count(user_id=config.user_id),
        "belief_count": await memory.count(user_id=config.user_id, type=MemoryType.BELIEF),
    }
```

### 1.4 Implementation Files

- `src/extension/providers/AccountViewProvider.ts` - Sidebar webview
- `src/draagon_forge/api/account.py` - Account API endpoints
- `src/draagon_forge/services/claude_config.py` - Claude config reader

---

## Phase 2: Session Usage & Model Tracking (P1)

**Goal:** Real-time visibility into token usage and model selection.

### 2.1 Usage Display

Add to Account view or separate "Usage" section:

```
┌─────────────────────────────────────────────────────────────┐
│  📊 Session Usage                                          │
├─────────────────────────────────────────────────────────────┤
│  TOKENS                                                     │
│  ──────────────────────────────────────────────────────────│
│  📥 Prompt:      12,345 tokens                             │
│  📤 Completion:   8,901 tokens                             │
│  📊 Total:       21,246 tokens                             │
│                                                             │
│  MODELS USED                                                │
│  ──────────────────────────────────────────────────────────│
│  ⚡ groq/llama-3.3-70b      15 calls    Free              │
│  🧠 claude-3-5-sonnet        3 calls    ~$0.12            │
│  🔮 claude-opus-4             1 call    ~$0.35            │
│                                                             │
│  💰 Estimated Cost: $0.47                                  │
│                                                             │
│  [View Details] [Reset Session]                            │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Token Tracking Service

Extend draagon-ai's SessionState:

```python
# src/draagon_forge/services/usage_tracker.py

@dataclass
class ModelUsage:
    model_id: str
    provider: str
    call_count: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_cents: float = 0.0

@dataclass
class SessionUsage:
    session_id: str
    user_id: str
    started_at: datetime
    models: dict[str, ModelUsage] = field(default_factory=dict)

    @property
    def total_tokens(self) -> int:
        return sum(m.total_tokens for m in self.models.values())

    @property
    def total_cost_cents(self) -> float:
        return sum(m.estimated_cost_cents for m in self.models.values())

    def record_usage(self, model_id: str, provider: str,
                     prompt_tokens: int, completion_tokens: int):
        if model_id not in self.models:
            self.models[model_id] = ModelUsage(model_id, provider)

        usage = self.models[model_id]
        usage.call_count += 1
        usage.prompt_tokens += prompt_tokens
        usage.completion_tokens += completion_tokens
        usage.total_tokens += prompt_tokens + completion_tokens
        usage.estimated_cost_cents += self._estimate_cost(
            model_id, prompt_tokens, completion_tokens
        )

class UsageTracker:
    """Tracks token usage across sessions with persistence."""

    _current_session: SessionUsage | None = None

    @classmethod
    def get_session(cls, user_id: str) -> SessionUsage:
        if cls._current_session is None:
            cls._current_session = SessionUsage(
                session_id=str(uuid.uuid4())[:8],
                user_id=user_id,
                started_at=datetime.utcnow(),
            )
        return cls._current_session

    @classmethod
    async def record(cls, model_id: str, provider: str,
                     prompt_tokens: int, completion_tokens: int,
                     user_id: str):
        session = cls.get_session(user_id)
        session.record_usage(model_id, provider, prompt_tokens, completion_tokens)

        # Emit event for Inspector
        await emit_event(
            EventType.SYSTEM_USAGE,
            {
                "model": model_id,
                "provider": provider,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
            },
            source="api",
            user_id=user_id,
        )
```

### 2.3 Integration Points

Hook into LLM providers to capture usage:

```python
# In draagon_ai.llm.anthropic or wrapper
async def _on_response(self, response: ChatResponse):
    if response.usage:
        await UsageTracker.record(
            model_id=self.model,
            provider="anthropic",
            prompt_tokens=response.usage.get("prompt_tokens", 0),
            completion_tokens=response.usage.get("completion_tokens", 0),
            user_id=config.user_id,
        )
```

### 2.4 API Endpoints

```python
@router.get("/usage/session")
async def get_session_usage() -> SessionUsage:
    """Get current session token usage."""
    return UsageTracker.get_session(config.user_id)

@router.post("/usage/reset")
async def reset_session_usage() -> dict:
    """Reset session usage tracking."""
    UsageTracker._current_session = None
    return {"status": "reset"}
```

---

## Phase 3: Knowledge Import (P1)

**Goal:** Allow users to bootstrap beliefs and knowledge from files.

### 3.1 Import Sources

Support importing from:
- **CLAUDE.md files** - Project principles and guidelines
- **Markdown documentation** - Architecture docs, READMEs
- **Spec Kit files** - Requirements, plans, tasks
- **Web URLs** - Documentation pages, articles (future)

### 3.2 Import UI

```
┌─────────────────────────────────────────────────────────────┐
│  📥 Import Knowledge                                 [✕]    │
├─────────────────────────────────────────────────────────────┤
│  Source Type: [CLAUDE.md ▼]                                │
│                                                             │
│  File Path:                                                 │
│  [/home/doug/myproject/CLAUDE.md                    📁]    │
│                                                             │
│  Import Options:                                            │
│  ☑ Extract principles as beliefs                           │
│  ☑ Detect conflicts with existing knowledge                │
│  ☐ Replace conflicting beliefs (default: investigate)      │
│                                                             │
│  Initial Conviction: [0.8 ═══════════════════]             │
│                                                             │
│                                        [Cancel] [Import]   │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Import Pipeline

Use draagon-ai's DocumentIngestionOrchestrator:

```python
# src/draagon_forge/services/knowledge_import.py

from draagon_ai.cognition.ingestion import (
    DocumentIngestionOrchestrator,
    KnowledgeSource,
    SourceType,
)

class KnowledgeImporter:
    def __init__(self, memory: LayeredMemoryProvider):
        self.orchestrator = DocumentIngestionOrchestrator(memory)

    async def import_claude_md(
        self,
        file_path: str,
        user_id: str,
        extract_principles: bool = True,
        initial_conviction: float = 0.8,
    ) -> ImportResult:
        """Import a CLAUDE.md file as knowledge/beliefs."""

        content = Path(file_path).read_text()

        # Create knowledge source with provenance
        source = KnowledgeSource(
            source_type=SourceType.FILE,
            source_id=file_path,
            content=content,
            trust_score=0.9,  # High trust for explicit project docs
            metadata={
                "file_type": "claude_md",
                "project": Path(file_path).parent.name,
            }
        )

        # Run ingestion pipeline
        result = await self.orchestrator.ingest(
            source,
            user_id=user_id,
            extract_beliefs=extract_principles,
            default_conviction=initial_conviction,
        )

        return ImportResult(
            facts_extracted=len(result.facts),
            beliefs_created=len(result.beliefs),
            conflicts_detected=len(result.conflicts),
            conflicts_resolved=len([c for c in result.conflicts if c.resolved]),
        )
```

### 3.4 CLAUDE.md Parser

Extract structured knowledge from CLAUDE.md:

```python
class ClaudeMdParser:
    """Parse CLAUDE.md files into structured beliefs."""

    PRINCIPLE_PATTERNS = [
        r"^[-*]\s+\*\*(NEVER|ALWAYS|MUST|SHOULD)\*\*",  # Emphasized imperatives
        r"^[-*]\s+(Never|Always|Must|Should)\s",        # Plain imperatives
        r"^\|.*\|(WRONG|RIGHT|BAD|GOOD)\|",             # Table comparisons
    ]

    async def extract_principles(
        self,
        content: str,
        llm: LLMProvider,
    ) -> list[ExtractedPrinciple]:
        """Use LLM to extract principles from CLAUDE.md."""

        prompt = f"""
        Extract development principles from this CLAUDE.md file.

        For each principle, provide:
        1. The principle statement (imperative form)
        2. Category: architecture, testing, security, llm, code_style, other
        3. Strength: critical (must follow), strong (should follow), advisory

        <document>
        {content}
        </document>

        Output as XML:
        <principles>
          <principle>
            <statement>Always use parameterized queries</statement>
            <category>security</category>
            <strength>critical</strength>
            <rationale>Prevents SQL injection</rationale>
          </principle>
          ...
        </principles>
        """

        response = await llm.chat([{"role": "user", "content": prompt}])
        return self._parse_principles_xml(response.content)
```

### 3.5 API Endpoints

```python
@router.post("/knowledge/import")
async def import_knowledge(
    file_path: str,
    source_type: str = "claude_md",
    extract_principles: bool = True,
    initial_conviction: float = 0.8,
) -> ImportResult:
    """Import knowledge from a file."""

@router.get("/knowledge/import/preview")
async def preview_import(file_path: str) -> ImportPreview:
    """Preview what would be imported without committing."""
```

---

## Phase 4: GitHub Repository Monitoring (P2)

**Goal:** Automatically learn from tracked repositories.

### 4.1 Repository Pool

```
┌─────────────────────────────────────────────────────────────┐
│  📦 Tracked Repositories                     [+ Add Repo]  │
├─────────────────────────────────────────────────────────────┤
│  ▼ draagon-ai/draagon-ai                     🟢 Synced     │
│    └─ Last sync: 2 hours ago | 47 facts | 12 beliefs       │
│  ▼ draagon-ai/draagon-forge                  🟢 Synced     │
│    └─ Last sync: 30 min ago | 23 facts | 8 beliefs         │
│  ▼ anthropics/claude-code                    🟡 Pending    │
│    └─ Queued for initial scan                              │
│  ▼ vercel/next.js                            ⚪ Paused     │
│    └─ Monitoring paused by user                            │
│                                                             │
│  [Sync All] [Manage Repos] [View Conflicts]                │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Repository Tracker

```python
# src/draagon_forge/services/repo_tracker.py

@dataclass
class TrackedRepository:
    repo_url: str           # github.com/org/repo
    owner: str
    name: str
    branch: str = "main"

    # What to monitor
    watch_claude_md: bool = True
    watch_spec_kit: bool = True
    watch_readme: bool = True
    watch_architecture_docs: bool = True

    # State
    last_commit_sha: str | None = None
    last_sync_at: datetime | None = None
    sync_status: str = "pending"  # pending, syncing, synced, error

    # Stats
    facts_extracted: int = 0
    beliefs_created: int = 0
    conflicts_detected: int = 0

class RepositoryTracker:
    """Monitors GitHub repositories for knowledge extraction."""

    def __init__(self, github_token: str):
        self.github = Github(github_token)
        self.importer = KnowledgeImporter(get_shared_memory())

    async def add_repository(
        self,
        repo_url: str,
        user_id: str,
        initial_scan: bool = True,
    ) -> TrackedRepository:
        """Add a repository to tracking."""

        # Parse repo URL
        owner, name = self._parse_repo_url(repo_url)

        repo = TrackedRepository(
            repo_url=repo_url,
            owner=owner,
            name=name,
        )

        # Store in memory with user scope
        await self._store_tracked_repo(repo, user_id)

        if initial_scan:
            await self.sync_repository(repo, user_id)

        return repo

    async def sync_repository(
        self,
        repo: TrackedRepository,
        user_id: str,
    ) -> SyncResult:
        """Sync a repository, extracting new knowledge."""

        repo.sync_status = "syncing"
        gh_repo = self.github.get_repo(f"{repo.owner}/{repo.name}")

        files_to_process = []

        # Find CLAUDE.md
        if repo.watch_claude_md:
            try:
                claude_md = gh_repo.get_contents("CLAUDE.md")
                files_to_process.append(("claude_md", claude_md))
            except:
                pass

        # Find spec kit
        if repo.watch_spec_kit:
            try:
                spec_files = gh_repo.get_contents(".specify")
                for f in spec_files:
                    if f.name.endswith(".md"):
                        files_to_process.append(("spec_kit", f))
            except:
                pass

        # Process each file
        results = []
        for file_type, file_content in files_to_process:
            content = file_content.decoded_content.decode("utf-8")
            result = await self.importer.import_content(
                content=content,
                source_type=file_type,
                source_id=f"{repo.repo_url}/{file_content.path}",
                user_id=user_id,
            )
            results.append(result)

        # Update repo state
        repo.last_commit_sha = gh_repo.get_branch(repo.branch).commit.sha
        repo.last_sync_at = datetime.utcnow()
        repo.sync_status = "synced"
        repo.facts_extracted = sum(r.facts_extracted for r in results)
        repo.beliefs_created = sum(r.beliefs_created for r in results)

        return SyncResult(repo=repo, file_results=results)

    async def check_for_updates(self, user_id: str) -> list[TrackedRepository]:
        """Check all tracked repos for updates. Called by curiosity engine."""

        repos = await self._get_tracked_repos(user_id)
        updated = []

        for repo in repos:
            gh_repo = self.github.get_repo(f"{repo.owner}/{repo.name}")
            current_sha = gh_repo.get_branch(repo.branch).commit.sha

            if current_sha != repo.last_commit_sha:
                updated.append(repo)

        return updated
```

### 4.3 Webhook Support (Future)

For real-time updates:

```python
@router.post("/webhooks/github")
async def github_webhook(request: Request) -> dict:
    """Handle GitHub push webhooks for instant sync."""

    payload = await request.json()
    event = request.headers.get("X-GitHub-Event")

    if event == "push":
        repo_url = payload["repository"]["html_url"]
        # Find tracked repo and trigger sync
        ...
```

### 4.4 Curiosity Engine Integration

The curiosity engine can periodically:
1. Check for repository updates
2. Propose new repositories based on imports/dependencies
3. Ask clarifying questions about detected conflicts

```python
class RepositoryCuriosityTrigger:
    """Generates curiosity questions from repository changes."""

    async def on_repo_sync(self, result: SyncResult) -> list[CuriosityQuestion]:
        questions = []

        # Conflicts detected
        for conflict in result.conflicts:
            questions.append(CuriosityQuestion(
                question=f"Repository {result.repo.name} has a principle that "
                         f"conflicts with existing belief: {conflict.description}. "
                         f"Which should take precedence?",
                options=["Use repo principle", "Keep existing", "Investigate"],
                context=conflict,
            ))

        # New patterns detected
        for pattern in result.new_patterns:
            questions.append(CuriosityQuestion(
                question=f"Detected a new pattern in {result.repo.name}: "
                         f"{pattern.description}. Should we adopt this?",
                options=["Adopt", "Ignore", "Ask later"],
            ))

        return questions
```

---

## Phase 5: Multi-Account & Organization Support (P2)

**Goal:** Support team/org hierarchy for shared knowledge.

### 5.1 Scope Hierarchy

Extend draagon-ai's HierarchicalScope:

```python
# Current: WORLD > CONTEXT > AGENT > USER > SESSION
# Extended: WORLD > ORG > TEAM > CONTEXT > AGENT > USER > SESSION

class ExtendedScopeType(Enum):
    WORLD = "world"      # Global knowledge
    ORG = "org"          # Organization-wide
    TEAM = "team"        # Team-specific
    CONTEXT = "context"  # Project context
    AGENT = "agent"      # Agent-specific
    USER = "user"        # User-specific
    SESSION = "session"  # Session-specific
```

### 5.2 Account Switching

```
┌─────────────────────────────────────────────────────────────┐
│  🔄 Switch Account                                   [✕]    │
├─────────────────────────────────────────────────────────────┤
│  Available Accounts:                                        │
│                                                             │
│  ● doug@personal.com (current)                             │
│    └─ Personal Organization                                │
│                                                             │
│  ○ doug@acme.com                                           │
│    └─ Acme Corp • Developer                                │
│                                                             │
│  ○ doug@startup.io                                         │
│    └─ Startup Inc • Admin                                  │
│                                                             │
│  [+ Add Account]                                           │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Knowledge Sharing

```python
class ScopedKnowledgeService:
    """Manages knowledge across scope hierarchy."""

    async def get_beliefs(
        self,
        user_id: str,
        org_id: str | None = None,
        team_id: str | None = None,
        include_inherited: bool = True,
    ) -> list[Belief]:
        """Get beliefs visible to user, optionally including inherited."""

        beliefs = []

        # User's personal beliefs
        beliefs.extend(await self._get_scoped_beliefs(
            scope_type=ScopeType.USER,
            scope_id=user_id,
        ))

        if include_inherited:
            # Team beliefs
            if team_id:
                beliefs.extend(await self._get_scoped_beliefs(
                    scope_type=ScopeType.TEAM,
                    scope_id=team_id,
                ))

            # Org beliefs
            if org_id:
                beliefs.extend(await self._get_scoped_beliefs(
                    scope_type=ScopeType.ORG,
                    scope_id=org_id,
                ))

            # World beliefs (public knowledge)
            beliefs.extend(await self._get_scoped_beliefs(
                scope_type=ScopeType.WORLD,
            ))

        return self._deduplicate_by_priority(beliefs)
```

---

## Implementation Roadmap

### Phase 1: Account Display (1-2 days)
- [ ] Create AccountViewProvider webview
- [ ] Read Claude config from ~/.claude.json
- [ ] Add Forge account API endpoints
- [ ] Display memory/belief counts
- [ ] Register in package.json

### Phase 2: Usage Tracking (2-3 days)
- [ ] Create UsageTracker service
- [ ] Hook into LLM provider responses
- [ ] Add usage API endpoints
- [ ] Extend Account view with usage section
- [ ] Add session reset functionality

### Phase 3: Knowledge Import (3-4 days)
- [ ] Create KnowledgeImporter service
- [ ] Implement CLAUDE.md parser
- [ ] Build import dialog UI
- [ ] Add preview functionality
- [ ] Handle conflict detection
- [ ] Add import API endpoints

### Phase 4: GitHub Monitoring (5-7 days)
- [ ] Create RepositoryTracker service
- [ ] Implement sync logic
- [ ] Build repository pool UI
- [ ] Add webhook endpoint (optional)
- [ ] Integrate with curiosity engine
- [ ] Add background sync scheduler

### Phase 5: Multi-Account (3-4 days)
- [ ] Extend scope hierarchy
- [ ] Create account switching UI
- [ ] Implement scoped knowledge service
- [ ] Add org/team management
- [ ] Update memory queries for scope

---

## Success Criteria

1. **Phase 1:** User can see Claude account and Forge identity in sidebar
2. **Phase 2:** User can see real-time token usage and estimated costs
3. **Phase 3:** User can import CLAUDE.md and see extracted beliefs
4. **Phase 4:** User can track GitHub repos with auto-sync
5. **Phase 5:** User can switch accounts and see scoped knowledge

---

## Technical Notes

### Existing draagon-ai Components to Leverage

| Component | Location | Use For |
|-----------|----------|---------|
| IdentityManager | /cognition/identity.py | User preferences |
| HierarchicalScope | /memory/scopes.py | Org/team scoping |
| SessionState | /reasoning/model_router.py | Token tracking |
| DocumentIngestionOrchestrator | /orchestration/document_ingestion.py | Knowledge import |
| KnowledgeSource | /cognition/ingestion/types.py | Provenance tracking |
| ConflictDetection | /cognition/ingestion/adapters.py | Belief conflicts |

### New Event Types

Add to EventType enum:
- `ACCOUNT_SWITCHED` - User changed account
- `KNOWLEDGE_IMPORTED` - File imported
- `REPO_SYNCED` - Repository synchronized
- `USAGE_RECORDED` - Token usage recorded
- `CONFLICT_DETECTED` - Knowledge conflict found

---

## Future Considerations

1. **Cost Allocation** - Bill usage to org/team budgets
2. **Usage Alerts** - Notify when approaching limits
3. **Knowledge Conflicts Dashboard** - UI for resolving conflicts
4. **Import History** - Track what was imported when
5. **Repository Suggestions** - AI suggests relevant repos
6. **Web Import** - Import from URLs, not just files
