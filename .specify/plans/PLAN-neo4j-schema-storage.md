# Neo4j Schema Storage Design

## Step 1: What Operations Do We Need?

### During Project Extraction

```
1. DETECT: Given a project's dependencies/files, which schemas apply?
   - Input: ["fastapi", "pydantic", "sqlalchemy"]
   - Output: Ordered list of schemas to apply

2. LOAD PATTERNS: Get all patterns for selected schemas
   - Input: schema_id
   - Output: All patterns with regex, captures, templates

3. APPLY: For each pattern, run regex and create nodes
   - Need: regex, flags, captures config, node_template, edge_template

4. SCOPE: Calculate line_end for matched nodes
   - Need: scope_method (indentation vs braces), language
```

### During Verification (Tier 2)

```
5. GET SAMPLE: Which extractions need verification?
   - Input: pattern_id, sample_rate
   - Output: Random sample of nodes to verify

6. GET PROMPT: Load verification prompt for a pattern
   - Input: pattern_id
   - Output: Prompt template string

7. RECORD RESULT: Update trust after verification
   - Input: pattern_id, result (verified/corrected/rejected)
   - Update: extractions++, corrections++, accuracy recalc
```

### During Evolution

```
8. FIND WEAK: Which patterns need improvement?
   - Query: patterns where correction_rate > threshold
   - Output: pattern_id, correction examples

9. GET EVOLUTION PROMPT: Load evolution prompt
   - Input: pattern_id
   - Output: Prompt template

10. CREATE VERSION: Save new pattern version
    - Input: old_pattern_id, new_regex, reason
    - Create: New pattern node, EVOLVED_FROM edge
```

### During Discovery (Tier 3)

```
11. GET DISCOVERY PROMPT: Load discovery prompt for schema
    - Input: schema_id
    - Output: Prompt template

12. ADD PATTERN: Create new pattern from LLM discovery
    - Input: schema_id, pattern definition
    - Create: New pattern node
```

## Step 2: Query Pattern Analysis

### Most Frequent Queries

| Query | Frequency | Must Be Fast |
|-------|-----------|--------------|
| Find schemas for dependencies | Per project | Yes |
| Load all patterns for schema | Per file | Yes |
| Update trust scores | Per extraction | Yes |
| Find weak patterns | Per evolution cycle | No |
| Load prompts | Per verification | Medium |

### Key Insight: Patterns Are Hot, Prompts Are Warm

- **Regex patterns** are accessed constantly during extraction
- **Prompts** are only accessed during verification (sampled)
- **Trust scores** are updated frequently but queries are simple

## Step 3: Optimal Neo4j Structure

### Node Types

```cypher
// Schema - the top-level grouping
(:Schema {
  id: "fastapi",
  name: "fastapi",
  type: "framework",           // language | framework | database | infra
  extends: "python",           // parent schema (for inheritance)
  version: "1.0.0",

  // Detection - stored as arrays for fast CONTAINS queries
  detect_dependencies: ["fastapi", "starlette", "uvicorn"],
  detect_files: ["main.py", "app/**/*.py"],
  detect_signatures: ["from fastapi import", "@app.get"],

  // Aggregate trust (computed from patterns)
  trust_level: "medium",
  trust_accuracy: 0.87,
  trust_extractions: 1523,
  trust_sample_rate: 0.5,

  // Timestamps
  created_at: datetime(),
  updated_at: datetime()
})

// Pattern - individual extraction pattern
(:Pattern {
  id: "fastapi::route_decorator::v3",
  schema_id: "fastapi",
  name: "route_decorator",
  version: 3,

  // The actual extraction logic - ALL IN ONE PLACE
  regex: "^(?P<indent>\\s*)@(?P<router>\\w+)...",
  flags: "gm",

  // Captures as JSON - simple to parse
  captures: '{"indent":{"group":1},"router":{"group":2},"method":{"group":3,"transform":"uppercase"}}',

  // Templates as JSON
  node_template: '{"type":"APIEndpoint","name_from":"path","properties":{"http_method":"method"}}',
  edge_templates: '[{"type":"DEFINED_IN","from":"current_node","to":"current_file"}]',

  // Scope detection
  scope_method: "python_indentation",  // or "braces", "none"

  // Trust for THIS pattern
  trust_accuracy: 0.91,
  trust_extractions: 487,
  trust_corrections: 38,
  trust_rejections: 6,

  // Active flag (for A/B testing new versions)
  is_active: true,

  created_at: datetime(),
  evolved_at: datetime()
})

// Prompt - stored separately, loaded on demand
(:Prompt {
  id: "fastapi::route_decorator::verify",
  pattern_id: "fastapi::route_decorator::v3",
  type: "verification",         // verification | discovery | evolution

  // The actual prompt template
  template: "...(long string)...",

  // Variables this prompt expects
  variables: ["file_path", "context_before", "source_content", "node.properties"],

  created_at: datetime()
})

// Framework - for detection lookups
(:Framework {
  name: "fastapi",
  ecosystem: "python",
  detection_weight: 1.0        // How strongly this indicates the framework
})

// Correction - stored for evolution analysis
(:Correction {
  id: uuid,
  pattern_id: "fastapi::route_decorator::v3",

  // What was wrong
  original_line_start: 45,
  original_line_end: 48,
  corrected_line_start: 43,
  corrected_line_end: 52,

  // Context for learning
  source_snippet: "...",
  reasoning: "Missing stacked decorator above",

  created_at: datetime()
})
```

### Relationships

```cypher
// Schema relationships
(:Schema)-[:EXTENDS]->(:Schema)           // fastapi extends python
(:Schema)-[:DETECTS]->(:Framework)        // fastapi detects fastapi framework
(:Schema)-[:CONTAINS]->(:Pattern)         // schema has patterns

// Pattern relationships
(:Pattern)-[:EVOLVED_FROM]->(:Pattern)    // version history
(:Pattern)-[:HAS_PROMPT]->(:Prompt)       // linked prompts

// Correction tracking
(:Pattern)-[:HAD_CORRECTION]->(:Correction)
```

### Indexes for Fast Queries

```cypher
// Find schemas by dependency
CREATE INDEX schema_deps FOR (s:Schema) ON (s.detect_dependencies)

// Find patterns by schema
CREATE INDEX pattern_schema FOR (p:Pattern) ON (p.schema_id)

// Find active patterns
CREATE INDEX pattern_active FOR (p:Pattern) ON (p.is_active)

// Find frameworks
CREATE INDEX framework_name FOR (f:Framework) ON (f.name)

// Unique constraints
CREATE CONSTRAINT schema_id FOR (s:Schema) REQUIRE s.id IS UNIQUE
CREATE CONSTRAINT pattern_id FOR (p:Pattern) REQUIRE p.id IS UNIQUE
```

## Step 4: Actual Queries

### 1. Find Schemas for Project

```cypher
// Input: project has dependencies ["fastapi", "pydantic", "sqlalchemy"]
MATCH (s:Schema)
WHERE ANY(dep IN $dependencies WHERE dep IN s.detect_dependencies)
RETURN s
ORDER BY s.trust_accuracy DESC
```

### 2. Load All Patterns for Extraction

```cypher
// Get schema + all parent schemas (inheritance)
MATCH path = (s:Schema {id: $schema_id})-[:EXTENDS*0..3]->(parent:Schema)
WITH collect(DISTINCT parent) + s AS schemas
UNWIND schemas AS schema
MATCH (schema)-[:CONTAINS]->(p:Pattern {is_active: true})
RETURN p
ORDER BY p.schema_id, p.name
```

### 3. Record Verification Result

```cypher
// Atomic update of trust scores
MATCH (p:Pattern {id: $pattern_id})
SET p.trust_extractions = p.trust_extractions + 1,
    p.trust_corrections = p.trust_corrections + CASE WHEN $result = 'corrected' THEN 1 ELSE 0 END,
    p.trust_rejections = p.trust_rejections + CASE WHEN $result = 'rejected' THEN 1 ELSE 0 END,
    p.trust_accuracy = toFloat(p.trust_extractions - p.trust_corrections - p.trust_rejections) / p.trust_extractions

// Also update parent schema's aggregate
WITH p
MATCH (s:Schema {id: p.schema_id})-[:CONTAINS]->(patterns:Pattern {is_active: true})
WITH s, avg(patterns.trust_accuracy) AS avg_acc, sum(patterns.trust_extractions) AS total
SET s.trust_accuracy = avg_acc,
    s.trust_extractions = total,
    s.trust_level = CASE
      WHEN avg_acc >= 0.95 AND total >= 100 THEN 'trusted'
      WHEN avg_acc >= 0.90 AND total >= 50 THEN 'high'
      WHEN avg_acc >= 0.80 AND total >= 20 THEN 'medium'
      ELSE 'low'
    END,
    s.trust_sample_rate = CASE s.trust_level
      WHEN 'trusted' THEN 0.05
      WHEN 'high' THEN 0.20
      WHEN 'medium' THEN 0.50
      ELSE 1.0
    END
```

### 4. Store Correction for Learning

```cypher
CREATE (c:Correction {
  id: randomUUID(),
  pattern_id: $pattern_id,
  original_line_start: $original.line_start,
  original_line_end: $original.line_end,
  corrected_line_start: $corrected.line_start,
  corrected_line_end: $corrected.line_end,
  source_snippet: $source_snippet,
  reasoning: $reasoning,
  created_at: datetime()
})
WITH c
MATCH (p:Pattern {id: $pattern_id})
CREATE (p)-[:HAD_CORRECTION]->(c)
```

### 5. Find Patterns Needing Evolution

```cypher
MATCH (p:Pattern {is_active: true})
WHERE p.trust_extractions >= 20
  AND (toFloat(p.trust_corrections) / p.trust_extractions > 0.10
       OR toFloat(p.trust_rejections) / p.trust_extractions > 0.05)
OPTIONAL MATCH (p)-[:HAD_CORRECTION]->(c:Correction)
RETURN p, collect(c) AS corrections
ORDER BY p.trust_accuracy ASC
LIMIT 10
```

### 6. Create Evolved Pattern

```cypher
// Create new version
CREATE (new:Pattern {
  id: $new_id,
  schema_id: $schema_id,
  name: $name,
  version: $old_version + 1,
  regex: $new_regex,
  flags: $flags,
  captures: $captures,
  node_template: $node_template,
  edge_templates: $edge_templates,
  scope_method: $scope_method,
  trust_accuracy: 0,
  trust_extractions: 0,
  trust_corrections: 0,
  trust_rejections: 0,
  is_active: true,
  created_at: datetime(),
  evolved_at: datetime()
})

// Link to old version
WITH new
MATCH (old:Pattern {id: $old_pattern_id})
SET old.is_active = false
CREATE (new)-[:EVOLVED_FROM]->(old)

// Link to schema
WITH new
MATCH (s:Schema {id: $schema_id})
CREATE (s)-[:CONTAINS]->(new)

RETURN new
```

### 7. Get Prompt for Verification

```cypher
MATCH (p:Pattern {id: $pattern_id})-[:HAS_PROMPT]->(prompt:Prompt {type: 'verification'})
RETURN prompt.template
```

## Step 5: What This Means for Storage

### Pattern Node is Self-Contained

Everything needed for extraction is on the Pattern node:
- `regex` - the pattern
- `flags` - regex flags
- `captures` - JSON of capture config
- `node_template` - JSON of node creation
- `edge_templates` - JSON array of edges
- `scope_method` - how to find line_end

**One query gets everything needed to extract.**

### Prompts Are Separate Nodes

- Only loaded when verification/evolution happens
- Can be updated without touching patterns
- Can have multiple prompts per pattern (verify, discover, evolve)

### Corrections Are Separate Nodes

- Don't bloat the Pattern node
- Can query for patterns by number of corrections
- Preserve context for evolution learning

### Trust Is Inline on Pattern

- Updated frequently, needs to be fast
- Simple increment operations
- No need for separate node

## Step 6: Summary - The Minimal Model

```
(:Schema)                    # Detection rules + aggregate trust
    |
    +-[:CONTAINS]->(:Pattern)   # Regex + templates + trust (self-contained)
    |                   |
    |                   +-[:HAS_PROMPT]->(:Prompt)      # Templates (loaded on demand)
    |                   |
    |                   +-[:EVOLVED_FROM]->(:Pattern)   # Version history
    |                   |
    |                   +-[:HAD_CORRECTION]->(:Correction)  # Learning data
    |
    +-[:EXTENDS]->(:Schema)     # Inheritance
    |
    +-[:DETECTS]->(:Framework)  # Detection mapping
```

### Node Count Estimate (per framework)

- 1 Schema node
- ~10-20 Pattern nodes
- ~30-60 Prompt nodes (3 per pattern)
- 0-N Correction nodes (grows with usage)

**Total: Very lightweight. Fast queries.**

## Step 7: Import/Export Can Be Anything

Now that we know the runtime format, import/export just needs to serialize/deserialize this structure.

Options:
1. **Single JSON file** - One file per schema, contains everything
2. **YAML with references** - Human-readable, prompts as separate files
3. **SQLite dump** - Portable, queryable offline
4. **Git-friendly YAML** - Directory structure for diffs

The import/export format is purely for human convenience and version control. The Neo4j structure is optimized for runtime.
