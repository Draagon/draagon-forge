# Tiered Extraction Architecture with Trust Scoring

## Problem Statement

Pure regex-based extraction has fundamental limitations:
1. **Line number accuracy** - Multiline regex matching causes position errors
2. **Scope detection** - Heuristics (indentation, braces) fail on edge cases
3. **Semantic understanding** - Can't distinguish context (call vs assignment)
4. **Cross-file relationships** - Can't resolve imports without following them
5. **Framework-specific patterns** - Each framework has unique idioms

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXTRACTION PIPELINE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │   TIER 1        │    │   TIER 2        │    │   TIER 3        │         │
│  │   Fast Regex    │───▶│   LLM Verify    │───▶│   LLM Discovery │         │
│  │   (Current)     │    │   (70B Review)  │    │   (Deep Analysis)│         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│         │                      │                      │                     │
│         ▼                      ▼                      ▼                     │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                    TRUST SCORING ENGINE                          │       │
│  │  - Pattern confidence (per schema, per pattern)                  │       │
│  │  - Historical accuracy (tracked corrections)                     │       │
│  │  - Language/framework specific scores                            │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Tier Definitions

### Tier 1: Fast Regex Extraction (Current Implementation)
- **Speed**: ~500ms for 300 files
- **Accuracy**: ~70-85% for well-structured code
- **Output**: Initial nodes/edges with extraction.tier=1
- **Trust**: Low initial trust, builds over time

### Tier 2: LLM Verification Layer (NEW)
- **Trigger**: All Tier 1 extractions initially, reduced based on trust
- **Model**: llama3.3-70b or similar (fast, capable)
- **Tasks**:
  1. Verify/correct line numbers by examining actual source
  2. Validate scope boundaries (line_start to line_end)
  3. Confirm relationship types (CALLS, IMPORTS, INHERITS)
  4. Add missing properties (visibility, async, decorators)
  5. Flag uncertain extractions for Tier 3

### Tier 3: LLM Deep Analysis (Selective)
- **Trigger**: Low-confidence extractions, complex patterns, new frameworks
- **Model**: claude-3.5-sonnet or GPT-4 (higher capability)
- **Tasks**:
  1. Discover patterns not captured by schemas
  2. Understand semantic relationships (what does this function actually do?)
  3. Cross-file dependency resolution
  4. Architecture pattern detection (MVC, Repository, etc.)

## Trust Scoring System

### Trust Dimensions

```typescript
interface TrustScore {
  // Schema-level trust (does this schema work well for this language?)
  schema_id: string;
  language: string;

  // Pattern-level trust (does this specific regex work?)
  pattern_name: string;

  // Metrics
  extractions_total: number;
  extractions_verified: number;      // Tier 2 confirmed
  extractions_corrected: number;     // Tier 2 fixed
  extractions_rejected: number;      // Tier 2 said wrong

  // Computed scores
  accuracy_score: number;            // verified / total
  correction_rate: number;           // corrected / total
  rejection_rate: number;            // rejected / total

  // Trust level (determines Tier 2 sampling rate)
  trust_level: 'low' | 'medium' | 'high' | 'trusted';
  tier2_sample_rate: number;         // 1.0 = verify all, 0.1 = 10% sample

  // Timestamps
  last_updated: string;
  last_verified: string;
}
```

### Trust Level Thresholds

| Trust Level | Accuracy | Correction Rate | Tier 2 Sample Rate |
|-------------|----------|-----------------|-------------------|
| low         | < 80%    | > 15%           | 100% (verify all) |
| medium      | 80-90%   | 10-15%          | 50%               |
| high        | 90-95%   | 5-10%           | 20%               |
| trusted     | > 95%    | < 5%            | 5% (spot check)   |

### Trust Storage Options

1. **Local Config File** (`~/.draagon-forge/trust-scores.json`)
   - Pros: Fast, no external dependencies
   - Cons: Not shared across machines

2. **Project-level** (`.draagon-forge/trust-scores.json`)
   - Pros: Version controlled, team-shared
   - Cons: Per-project, not global learning

3. **Neo4j Graph** (TrustScore nodes linked to Schema nodes)
   - Pros: Queryable, relationship-aware, central
   - Cons: Requires Neo4j connection

4. **Hybrid** (RECOMMENDED)
   - Local cache for speed
   - Neo4j for persistence and cross-project learning
   - Sync on startup and periodically

## Implementation Plan

### Phase 1: Tier 2 Verification Layer

```typescript
interface Tier2VerificationRequest {
  node: MeshNode;
  source_content: string;        // Actual source code around the node
  context_before: string;        // 10 lines before
  context_after: string;         // 10 lines after
  extraction_metadata: {
    schema: string;
    pattern: string;
    regex_match: string;
  };
}

interface Tier2VerificationResult {
  status: 'verified' | 'corrected' | 'rejected';
  corrections?: {
    line_start?: number;
    line_end?: number;
    properties?: Record<string, unknown>;
  };
  confidence: number;
  reasoning: string;
}
```

### Phase 2: Trust Scoring Engine

```typescript
class TrustScoringEngine {
  private localCache: Map<string, TrustScore>;
  private neo4jClient: Neo4jClient;

  async recordVerification(
    schemaId: string,
    patternName: string,
    result: Tier2VerificationResult
  ): Promise<void>;

  async getTrustScore(schemaId: string, patternName: string): Promise<TrustScore>;

  async shouldVerify(schemaId: string, patternName: string): Promise<boolean>;

  async syncToNeo4j(): Promise<void>;
}
```

### Phase 3: Adaptive Pipeline

```typescript
class AdaptiveExtractionPipeline {
  async extract(file: SourceFile): Promise<ExtractionResult> {
    // Tier 1: Fast regex
    const tier1Result = await this.tier1Extractor.extract(file);

    // Determine which nodes need Tier 2 verification
    const nodesToVerify = await this.selectForVerification(tier1Result.nodes);

    // Tier 2: LLM verification (batched for efficiency)
    const tier2Results = await this.tier2Verifier.verifyBatch(nodesToVerify);

    // Update trust scores based on results
    await this.trustEngine.recordVerifications(tier2Results);

    // Tier 3: Deep analysis for rejected/uncertain nodes
    const uncertainNodes = tier2Results.filter(r => r.status === 'rejected');
    const tier3Results = await this.tier3Analyzer.analyze(uncertainNodes);

    return this.mergeResults(tier1Result, tier2Results, tier3Results);
  }
}
```

## LLM Prompt Design for Tier 2

```xml
<task>Verify and correct code extraction</task>

<source_file>
{file_path}
</source_file>

<source_content>
{source_code_with_line_numbers}
</source_content>

<extraction>
<node type="{type}" name="{name}">
  <claimed_source line_start="{line_start}" line_end="{line_end}" />
  <properties>{properties}</properties>
</node>
</extraction>

<instructions>
1. Verify the line_start matches where the {type} "{name}" is actually defined
2. Verify line_end captures the full scope of the {type}
3. Check if properties are correct
4. Report any corrections needed
</instructions>

<response_format>
<verification>
  <status>verified|corrected|rejected</status>
  <corrections>
    <line_start>{correct_line}</line_start>
    <line_end>{correct_end_line}</line_end>
    <properties>{corrected_properties}</properties>
  </corrections>
  <confidence>0.0-1.0</confidence>
  <reasoning>Why this verification result</reasoning>
</verification>
</response_format>
```

## Cost Estimation

Assuming 10,000 nodes extracted:

| Trust Level | Nodes Verified | Tokens/Node | Cost (70B) |
|-------------|----------------|-------------|------------|
| low (100%)  | 10,000         | ~500        | ~$0.50     |
| medium (50%)| 5,000          | ~500        | ~$0.25     |
| high (20%)  | 2,000          | ~500        | ~$0.10     |
| trusted (5%)| 500            | ~500        | ~$0.025    |

With trust building, costs decrease over time as patterns prove reliable.

## Quality Metrics

Track and display:
1. **Extraction accuracy** by language/framework
2. **Pattern reliability** scores
3. **Correction frequency** trends
4. **Trust level progression** over time
5. **Cost per extraction** at each tier

## Next Steps

1. Implement Tier 2 verifier with Ollama/llama3.3-70b
2. Create trust scoring storage (hybrid local + Neo4j)
3. Add CLI commands for trust inspection
4. Build adaptive sampling based on trust levels
5. Create dashboard for quality metrics
