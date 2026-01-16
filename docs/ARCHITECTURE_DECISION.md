# Architecture Decision: Self-Improving Pipeline

**Date:** 2026-01-15
**Decision:** Wire the pipeline together, don't create CLI wrapper layers
**Status:** ✅ IMPLEMENTED

---

## The Mistake We Made

We created a Python `CodeMeshExtension` that tries to call mesh-builder CLI commands (`evolve`, `generate-schema`, `analyze-coverage`) **that don't exist**.

This is fundamentally wrong because:

1. **Schema evolution should happen IN the extraction pipeline, not as an external call**
2. **The TypeScript code already has all the pieces - they're just not wired together**
3. **Adding Python CLI wrappers creates a Rube Goldberg machine**

---

## Implementation Completed

All components have been wired together:

### FileExtractor.ts Changes:

1. **Tier 2 Verification** - Now calls `Tier2Verifier.verifyBatch()` when confidence < threshold
2. **Tier 3 Discovery** - Now calls `Tier3Discoverer.discover()` for unknown patterns
3. **Schema Evolution** - Runs `SchemaEvolver.runEvolutionCycle()` after extraction batch
4. **AI Stats Tracking** - Records `aiCalls` and `aiTokensUsed` in statistics

### SchemaEvolver.ts Changes:

1. **runEvolutionCycle()** - Now actually evolves patterns (was just logging)
2. Uses `getPatternCorrections()` to gather examples for LLM evolution

### SchemaGraphStore.ts Changes:

1. Added `getPatternCorrections()` - Query correction examples for evolution
2. Added `recordCorrection()` - Store corrections for future evolution

### Python Extension Changes:

1. Removed `_evolve_schema()` - mesh-builder handles internally
2. Removed `_find_unknown_frameworks()` - mesh-builder handles internally
3. Removed `_attempt_schema_generation()` - mesh-builder handles internally
4. Added `_update_expertise_from_neo4j()` - Read actual results from database
5. Simplified `_learning_loop()` - Only tracks expertise, doesn't drive evolution

---

## The Correct Architecture

### What NOW Works in mesh-builder (TypeScript):

```
FileExtractor.ts        → Tier 1 regex extraction (WORKS)
                        → Tier 2: Calls Tier2Verifier.verifyBatch() ✅
                        → Tier 3: Calls Tier3Discoverer.discover() ✅

Tier2Verifier.ts        → LLM verification logic (CONNECTED)
Tier3Discoverer.ts      → LLM discovery logic (CONNECTED)
AIClient.ts             → Groq/Claude API calls (USED)
SchemaEvolver.ts        → Pattern evolution logic (CONNECTED)
SchemaGraphStore.ts     → Neo4j pattern storage (CONNECTED)
```

### What Should Happen:

```
Extraction Flow (TypeScript - ALL IN ONE PROCESS):
┌─────────────────────────────────────────────────────────────┐
│                     FileExtractor                            │
│                                                              │
│  1. Try Tier 1 (regex)                                       │
│     └─ If confidence < threshold AND enableAI:               │
│                                                              │
│  2. Escalate to Tier 2 (verify)                              │
│     └─ Tier2Verifier.verify(nodes)                          │
│     └─ Update TrustScoringEngine                            │
│     └─ If still low confidence:                              │
│                                                              │
│  3. Escalate to Tier 3 (discover)                            │
│     └─ Tier3Discoverer.discover(file)                       │
│     └─ Collect schema suggestions                            │
│                                                              │
│  4. After extraction batch:                                  │
│     └─ SchemaEvolver.runEvolutionCycle()                    │
│     └─ SchemaGenerator.generateFromDiscoveries()            │
│     └─ Save evolved schemas                                  │
│     └─ Reload SchemaRegistry                                 │
│                                                              │
│  5. Next extraction uses improved schemas                    │
└─────────────────────────────────────────────────────────────┘
```

### Where Does Python Fit?

The Python extension should do **orchestration and learning**, not extraction:

```
Python Extension Role:
┌─────────────────────────────────────────────────────────────┐
│                   CodeMeshExtension                          │
│                                                              │
│  1. Trigger extraction (call mesh-builder sync)              │
│     └─ This is ONE CLI call, not many                        │
│                                                              │
│  2. Read extraction results from Neo4j                       │
│     └─ Query nodes, edges, trust scores                      │
│                                                              │
│  3. Update TransactiveMemory                                 │
│     └─ Track which schemas/languages have expertise          │
│                                                              │
│  4. Broadcast via LearningChannel                            │
│     └─ Share discoveries with other agents                   │
│                                                              │
│  5. Provide MCP tools for other agents                       │
│     └─ query_mesh, get_schema_health, etc.                  │
└─────────────────────────────────────────────────────────────┘
```

---

## The Fix

### Phase 1: Wire TypeScript Pipeline (mesh-builder)

**File: `src/mesh-builder/src/extractors/FileExtractor.ts`**

Replace lines 236-246:
```typescript
} else if (routing.tier === 2) {
  // Tier 2: AI-assisted verification
  const verifier = new Tier2Verifier(this.aiClient);
  const verified = await verifier.verify(nodes, sourceFile);
  nodes = verified.nodes;
  confidence = verified.confidence;
  tier = 2;

  // Update trust scores
  this.trustEngine.recordVerification(schemasUsed, verified);

} else if (routing.tier === 3) {
  // Tier 3: Full AI discovery
  const discoverer = new Tier3Discoverer(this.aiClient);
  const discovery = await discoverer.discover(sourceFile);
  nodes.push(...discovery.nodes);
  edges.push(...discovery.edges);
  confidence = discovery.confidence;
  tier = 3;

  // Collect schema suggestions for evolution
  this.schemaEvolver.collectSuggestions(discovery.schemaSuggestions);
}
```

**Add to extraction pipeline end:**
```typescript
// After all files extracted
if (this.options.enableAI && this.schemaEvolver.hasSuggestions()) {
  await this.schemaEvolver.runEvolutionCycle();
}
```

### Phase 2: Simplify Python Extension

**Remove** these methods from `extension.py`:
- `_evolve_schema()` - mesh-builder does this internally
- `_find_unknown_frameworks()` - mesh-builder does this internally
- `_attempt_schema_generation()` - mesh-builder does this internally

**Keep** these methods:
- `_extract_project()` - calls `mesh-builder sync`
- `_sync_project()` - calls `mesh-builder sync`
- `_query_mesh()` - queries Neo4j
- `record_extraction_outcome()` - tracks in TransactiveMemory
- `_broadcast_*()` - shares via LearningChannel

**The learning loop becomes:**
```python
async def _learning_loop(self) -> None:
    while not self._shutdown_event.is_set():
        # 1. Check Neo4j for recent extractions
        recent = await self._query_recent_extractions()

        # 2. Update TransactiveMemory from actual results
        for extraction in recent:
            await self._update_expertise_from_extraction(extraction)

        # 3. Broadcast any new schema discoveries
        new_schemas = await self._query_new_schemas()
        for schema in new_schemas:
            await self._broadcast_schema_discovery(schema)

        # 4. Sleep and repeat
        await asyncio.sleep(self._config.check_interval)
```

---

## Why This Is Better

| Aspect | CLI Wrapper Approach | Integrated Pipeline |
|--------|---------------------|---------------------|
| Latency | Multiple process spawns | Single process |
| Error handling | JSON parsing, exit codes | Exceptions |
| Type safety | dict[str, Any] | Full types |
| Testing | E2E only | Unit testable |
| Complexity | High (2 languages, CLI parsing) | Low (one language per layer) |
| Evolution | Requires CLI commands | Automatic in pipeline |

---

## Implementation Order

1. **Wire Tier 2 in FileExtractor** (1 day)
   - Instantiate Tier2Verifier
   - Call verify() on low-confidence extractions
   - Update trust scores

2. **Wire Tier 3 in FileExtractor** (1 day)
   - Instantiate Tier3Discoverer
   - Call discover() on unknown patterns
   - Collect schema suggestions

3. **Wire SchemaEvolver at pipeline end** (1 day)
   - Call runEvolutionCycle() after extraction batch
   - Actually execute pattern evolution (not just log)
   - Save evolved schemas

4. **Simplify Python extension** (0.5 day)
   - Remove fake CLI calls
   - Query Neo4j for trust scores
   - Let TransactiveMemory reflect actual extraction quality

5. **Update tests** (0.5 day)
   - E2E test with real AI calls
   - Verify schema evolution produces new patterns

---

## Summary

**Don't**: Create Python wrappers that call non-existent CLI commands
**Do**: Wire the TypeScript pipeline together so it self-improves internally

The Python extension's job is to:
1. Trigger extractions
2. Read results from Neo4j
3. Track expertise in TransactiveMemory
4. Broadcast learnings to other agents

It should NOT try to implement schema evolution - that happens inside mesh-builder where all the code already exists.
