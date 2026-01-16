# REQ-036: Data Model & ORM Extraction

**Status:** Draft
**Priority:** P0
**Created:** 2026-01-15
**Author:** Doug / Claude
**Depends On:** REQ-033 (Code Knowledge Mesh), REQ-034 (Extraction Context Provider)
**Layer:** L3 (draagon-forge) - Programming-specific

---

## Summary

Extract semantic knowledge from database schemas, ORM entities, and data access patterns. Enable the Code Knowledge Mesh to understand not just "what tables exist" but "how data is structured, what relationships exist, what constraints apply, and how code accesses data."

**Key Capabilities:**
- **Entity Extraction**: Prisma models, TypeORM entities, SQLAlchemy models, Django models
- **Relationship Mapping**: OneToMany, ManyToOne, ManyToMany with cardinality
- **Constraint Detection**: unique, nullable, default, check constraints, indexes
- **Migration Tracking**: Schema evolution history and version tracking
- **Query Pattern Analysis**: Repository methods, raw queries, query builders
- **Data Classification**: PII/PHI/PCI field tagging for compliance

---

## Problem Statement

### Why Data Model Extraction Matters

Data models are the foundation of every application. Understanding them enables:

```typescript
// What structural extraction sees:
// - Class: User
// - Property: email (string)
// - Decorator: @Column

// What we NEED to understand:
// - This is a database entity in PostgreSQL 'users' table
// - 'email' has UNIQUE constraint, indexed for lookups
// - 'email' is PII data (privacy implications)
// - User has OneToMany relationship with Orders
// - User belongs to Organization (ManyToOne)
// - 'createdAt' auto-generates on insert
// - There's a migration adding 'lastLoginAt' pending
```

### The Cross-ORM Problem

Different ORMs have different patterns:

| ORM | Language | Pattern | Example |
|-----|----------|---------|---------|
| Prisma | TypeScript | Schema DSL | `model User { email String @unique }` |
| TypeORM | TypeScript | Decorators | `@Column({ unique: true }) email: string` |
| Sequelize | JavaScript | Model define | `email: { type: STRING, unique: true }` |
| SQLAlchemy | Python | Classes | `email = Column(String, unique=True)` |
| Django | Python | Models | `email = models.EmailField(unique=True)` |
| ActiveRecord | Ruby | Migrations | `t.string :email, index: { unique: true }` |
| GORM | Go | Tags | `Email string \`gorm:"uniqueIndex"\`` |
| Entity Framework | C# | Attributes | `[Index(IsUnique = true)] public string Email` |

### Questions We Can't Answer Today

- What tables does `OrderService.createOrder()` write to?
- If I add a column to `users`, what code needs to change?
- Which fields contain PII data?
- What's the join path from `User` to `Invoice`?
- Are there any N+1 query patterns in this codebase?
- What indexes exist on the `orders` table?

---

## Solution Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       DATA MODEL EXTRACTION                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    ORM DETECTION (from REQ-034)                          │   │
│  │   Prisma | TypeORM | SQLAlchemy | Django | Sequelize | GORM | EF        │   │
│  └──────────────────────────────────┬──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                 ORM-SPECIFIC EXTRACTORS                                  │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │   │
│  │  │   Prisma    │ │  TypeORM    │ │ SQLAlchemy  │ │     Django      │   │   │
│  │  │  Extractor  │ │  Extractor  │ │  Extractor  │ │    Extractor    │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘   │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                  UNIFIED DATA GRAPH NODES                                │   │
│  │  Entity | Field | Relationship | Index | Constraint | Migration         │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                  RELATIONSHIP EDGES                                      │   │
│  │  HAS_FIELD | RELATES_TO | INDEXES | MIGRATES_TO | QUERIES               │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Graph Schema - Data Nodes

### R1: Entity/Model Nodes

**R1.1: Entity Node Type**

```typescript
interface EntityNode {
  type: 'Entity';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Database mapping
  table_name: string;
  schema?: string;  // 'public', 'dbo', etc.
  database?: string;

  // ORM info
  orm: 'prisma' | 'typeorm' | 'sqlalchemy' | 'django' | 'sequelize' |
       'gorm' | 'entity_framework' | 'active_record';

  // Entity type
  entity_type: 'table' | 'view' | 'materialized_view' | 'virtual';

  // Metadata
  is_soft_delete: boolean;
  soft_delete_column?: string;
  timestamps: {
    created_at?: string;
    updated_at?: string;
    deleted_at?: string;
  };

  // Documentation
  description?: string;
}
```

**R1.2: Field/Column Node Type**

```typescript
interface FieldNode {
  type: 'Field';
  name: string;
  column_name: string;  // May differ from property name
  entity: string;
  file: string;
  line: number;

  // Type information
  property_type: string;  // TypeScript/Python type
  database_type: string;  // VARCHAR(255), INT, etc.

  // Constraints
  is_primary_key: boolean;
  is_foreign_key: boolean;
  is_nullable: boolean;
  is_unique: boolean;
  is_auto_increment: boolean;
  is_generated: boolean;  // Computed columns

  default_value?: string;
  check_constraint?: string;

  // Length/Precision
  max_length?: number;
  precision?: number;
  scale?: number;

  // Enum
  is_enum: boolean;
  enum_values?: string[];

  // Data classification (compliance)
  data_classification?: 'PII' | 'PHI' | 'PCI' | 'SENSITIVE' | 'PUBLIC';
  encryption?: 'at_rest' | 'in_transit' | 'both' | 'none';

  // Documentation
  description?: string;
}
```

**R1.3: Relationship Node Type**

```typescript
interface DataRelationshipNode {
  type: 'DataRelationship';
  name: string;  // Property name
  file: string;
  line: number;

  // Relationship type
  cardinality: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
  is_bidirectional: boolean;

  // Source entity
  from_entity: string;
  from_field?: string;  // FK field on source

  // Target entity
  to_entity: string;
  to_field?: string;  // FK field on target (or PK)

  // Join table (many-to-many)
  join_table?: string;
  join_columns?: {
    source_column: string;
    target_column: string;
  };

  // Cascade behavior
  on_delete: 'cascade' | 'set_null' | 'restrict' | 'no_action';
  on_update: 'cascade' | 'set_null' | 'restrict' | 'no_action';

  // Loading strategy
  eager_load: boolean;
  lazy_load: boolean;
}
```

**R1.4: Index Node Type**

```typescript
interface IndexNode {
  type: 'Index';
  name: string;
  entity: string;
  file: string;
  line?: number;

  // Index type
  index_type: 'btree' | 'hash' | 'gin' | 'gist' | 'brin' | 'fulltext';

  // Columns
  columns: Array<{
    name: string;
    order: 'asc' | 'desc';
    nulls_first?: boolean;
  }>;

  // Properties
  is_unique: boolean;
  is_primary: boolean;
  is_partial: boolean;
  partial_condition?: string;  // WHERE clause

  // Composite
  is_composite: boolean;
}
```

**R1.5: Migration Node Type**

```typescript
interface MigrationNode {
  type: 'Migration';
  name: string;
  file: string;
  timestamp: string;  // ISO date or version number

  // Status
  status: 'pending' | 'applied' | 'failed' | 'rolled_back';
  applied_at?: string;

  // Operations
  operations: Array<{
    type: 'create_table' | 'drop_table' | 'add_column' | 'drop_column' |
          'add_index' | 'drop_index' | 'add_constraint' | 'rename' | 'raw_sql';
    target: string;  // Table/column name
    details: Record<string, unknown>;
  }>;

  // Dependencies
  depends_on?: string[];  // Previous migrations
}
```

**R1.6: Query Pattern Node Type**

```typescript
interface QueryPatternNode {
  type: 'QueryPattern';
  name: string;  // Method/function name
  file: string;
  line: number;

  // Query type
  query_type: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | 'raw';

  // Entities involved
  primary_entity: string;
  joined_entities: string[];

  // Analysis
  uses_transaction: boolean;
  potential_n_plus_one: boolean;
  has_where_clause: boolean;
  has_order_by: boolean;
  has_limit: boolean;

  // Raw SQL (if applicable)
  raw_sql?: string;
}
```

---

## Part 2: Graph Schema - Data Edges

### R2: Relationship Types

**R2.1: HAS_FIELD Edge**

```typescript
interface HasFieldEdge {
  type: 'HAS_FIELD';
  from: EntityNode;
  to: FieldNode;
}
```

**R2.2: RELATES_TO Edge**

```typescript
interface RelatesToEdge {
  type: 'RELATES_TO';
  from: EntityNode;
  to: EntityNode;

  relationship_name: string;
  cardinality: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
  foreign_key_field: string;
}
```

**R2.3: REFERENCES Edge (FK)**

```typescript
interface ReferencesEdge {
  type: 'REFERENCES';
  from: FieldNode;  // FK field
  to: FieldNode;    // PK/unique field

  constraint_name?: string;
}
```

**R2.4: INDEXED_BY Edge**

```typescript
interface IndexedByEdge {
  type: 'INDEXED_BY';
  from: FieldNode;
  to: IndexNode;

  position: number;  // Column position in composite index
}
```

**R2.5: QUERIES Edge**

```typescript
interface QueriesEdge {
  type: 'QUERIES';
  from: FunctionNode;  // Repository method
  to: EntityNode;

  query_type: 'read' | 'write' | 'both';
  via_relationship?: string;
}
```

**R2.6: MIGRATES_TO Edge**

```typescript
interface MigratesToEdge {
  type: 'MIGRATES_TO';
  from: MigrationNode;
  to: MigrationNode;
}
```

---

## Part 3: ORM-Specific Extractors

### R3: Prisma Extractor

**R3.1: Schema Parsing**

```typescript
// Prisma schema is its own DSL in schema.prisma
const prismaPatterns = {
  model: /model\s+(\w+)\s*\{([^}]+)\}/gs,
  enum: /enum\s+(\w+)\s*\{([^}]+)\}/gs,

  // Field patterns
  field: /(\w+)\s+(\w+)(\[\])?([\?!])?(?:\s+@([^\n]+))?/g,

  // Attributes
  id: /@id/,
  unique: /@unique/,
  default: /@default\(([^)]+)\)/,
  relation: /@relation\(([^)]+)\)/,
  map: /@map\("([^"]+)"\)/,
  dbType: /@db\.(\w+)(?:\(([^)]+)\))?/,
  index: /@@index\(\[([^\]]+)\]/,
  uniqueIndex: /@@unique\(\[([^\]]+)\]/,
};
```

**R3.2: Relationship Extraction**

```typescript
interface PrismaRelationship {
  field_name: string;
  target_model: string;
  is_list: boolean;
  is_optional: boolean;
  fields?: string[];  // Local FK fields
  references?: string[];  // Target PK fields
  on_delete?: string;
  on_update?: string;
}

// Example:
// posts Post[] @relation("UserPosts")
// author User @relation("UserPosts", fields: [authorId], references: [id])
```

### R4: TypeORM Extractor

**R4.1: Decorator Patterns**

```typescript
const typeormPatterns = {
  entity: /@Entity\((?:['"](\w+)['"]|\{([^}]+)\})?\)/,

  // Column types
  column: /@Column\((?:\{([^}]+)\}|['"](\w+)['"])?\)/,
  primaryColumn: /@PrimaryGeneratedColumn\((?:['"](\w+)['"]|\{([^}]+)\})?\)/,
  createDateColumn: /@CreateDateColumn\(/,
  updateDateColumn: /@UpdateDateColumn\(/,
  deleteColumn: /@DeleteDateColumn\(/,
  versionColumn: /@VersionColumn\(/,

  // Relationships
  oneToOne: /@OneToOne\(\s*\(\)\s*=>\s*(\w+)/,
  oneToMany: /@OneToMany\(\s*\(\)\s*=>\s*(\w+)/,
  manyToOne: /@ManyToOne\(\s*\(\)\s*=>\s*(\w+)/,
  manyToMany: /@ManyToMany\(\s*\(\)\s*=>\s*(\w+)/,
  joinColumn: /@JoinColumn\(\{([^}]+)\}\)/,
  joinTable: /@JoinTable\(\{([^}]+)\}\)/,

  // Indexes
  index: /@Index\((?:\[([^\]]+)\]|\{([^}]+)\})?\)/,
  uniqueIndex: /@Index\(\{[^}]*unique:\s*true/,
};
```

**R4.2: Entity Class Extraction**

```typescript
interface TypeORMEntityExtraction {
  name: string;
  table_name?: string;
  schema?: string;
  columns: Array<{
    property_name: string;
    column_name?: string;
    type: string;
    db_type?: string;
    is_primary: boolean;
    is_generated: boolean;
    is_nullable: boolean;
    is_unique: boolean;
    default?: string;
    length?: number;
    precision?: number;
    scale?: number;
    enum?: string[];
  }>;
  relationships: Array<{
    property_name: string;
    type: 'OneToOne' | 'OneToMany' | 'ManyToOne' | 'ManyToMany';
    target: string;
    inverse_side?: string;
    join_column?: string;
    eager?: boolean;
    cascade?: string[];
    on_delete?: string;
  }>;
  indexes: Array<{
    columns: string[];
    is_unique: boolean;
    name?: string;
  }>;
}
```

### R5: SQLAlchemy Extractor

**R5.1: Model Patterns**

```python
# Pattern matching for SQLAlchemy models
sqlalchemy_patterns = {
    # Class definition
    'model': r'class\s+(\w+)\s*\((?:.*?Base.*?|.*?Model.*?)\)',

    # Table name
    'tablename': r'__tablename__\s*=\s*[\'"](\w+)[\'"]',

    # Columns
    'column': r'(\w+)\s*=\s*(?:Column|mapped_column)\s*\(([^)]+)\)',

    # Relationships
    'relationship': r'(\w+)\s*=\s*relationship\s*\([\'"](\w+)[\'"]([^)]*)\)',

    # Foreign keys
    'foreign_key': r'ForeignKey\s*\([\'"]([^"\']+)[\'"]',

    # Index
    'index': r'Index\s*\([\'"](\w+)[\'"],\s*([^)]+)\)',
}
```

**R5.2: Column Type Mapping**

```typescript
const sqlalchemyTypeMap = {
  'Integer': 'INT',
  'BigInteger': 'BIGINT',
  'SmallInteger': 'SMALLINT',
  'String': 'VARCHAR',
  'Text': 'TEXT',
  'Boolean': 'BOOLEAN',
  'DateTime': 'TIMESTAMP',
  'Date': 'DATE',
  'Time': 'TIME',
  'Float': 'FLOAT',
  'Numeric': 'DECIMAL',
  'JSON': 'JSON',
  'JSONB': 'JSONB',
  'UUID': 'UUID',
  'Enum': 'ENUM',
  'LargeBinary': 'BYTEA',
};
```

### R6: Django Extractor

**R6.1: Model Patterns**

```python
django_patterns = {
    # Model class
    'model': r'class\s+(\w+)\s*\((?:models\.Model|.*Model.*)\)',

    # Meta class
    'meta': r'class\s+Meta\s*:\s*([^}]+?)(?=\n\s*\n|\n\s*\w+\s*=)',

    # Fields
    'field': r'(\w+)\s*=\s*models\.(\w+Field)\s*\(([^)]*)\)',

    # Foreign key
    'foreign_key': r'models\.ForeignKey\s*\([\'"]?(\w+)[\'"]?',

    # Many to many
    'many_to_many': r'models\.ManyToManyField\s*\([\'"]?(\w+)[\'"]?',

    # One to one
    'one_to_one': r'models\.OneToOneField\s*\([\'"]?(\w+)[\'"]?',
}
```

**R6.2: Field Type Mapping**

```typescript
const djangoFieldMap = {
  'CharField': { db_type: 'VARCHAR', has_length: true },
  'TextField': { db_type: 'TEXT' },
  'IntegerField': { db_type: 'INT' },
  'BigIntegerField': { db_type: 'BIGINT' },
  'SmallIntegerField': { db_type: 'SMALLINT' },
  'FloatField': { db_type: 'FLOAT' },
  'DecimalField': { db_type: 'DECIMAL', has_precision: true },
  'BooleanField': { db_type: 'BOOLEAN' },
  'DateField': { db_type: 'DATE' },
  'DateTimeField': { db_type: 'TIMESTAMP' },
  'TimeField': { db_type: 'TIME' },
  'EmailField': { db_type: 'VARCHAR', max_length: 254 },
  'URLField': { db_type: 'VARCHAR', max_length: 200 },
  'UUIDField': { db_type: 'UUID' },
  'JSONField': { db_type: 'JSON' },
  'FileField': { db_type: 'VARCHAR', max_length: 100 },
  'ImageField': { db_type: 'VARCHAR', max_length: 100 },
  'ForeignKey': { db_type: 'INT', is_fk: true },
  'OneToOneField': { db_type: 'INT', is_fk: true },
  'ManyToManyField': { is_m2m: true },
};
```

### R7: Sequelize Extractor

**R7.1: Model Definition Patterns**

```typescript
const sequelizePatterns = {
  // Model.init({ ... }, { ... })
  modelInit: /(\w+)\.init\s*\(\s*\{([^}]+)\}\s*,\s*\{([^}]+)\}/gs,

  // sequelize.define('name', { ... })
  defineModel: /sequelize\.define\s*\(\s*['"](\w+)['"]\s*,\s*\{([^}]+)\}/gs,

  // Field definition
  field: /(\w+)\s*:\s*\{([^}]+)\}/g,
  fieldType: /type\s*:\s*DataTypes\.(\w+)/,

  // Associations
  hasOne: /(\w+)\.hasOne\s*\(\s*(\w+)/g,
  hasMany: /(\w+)\.hasMany\s*\(\s*(\w+)/g,
  belongsTo: /(\w+)\.belongsTo\s*\(\s*(\w+)/g,
  belongsToMany: /(\w+)\.belongsToMany\s*\(\s*(\w+)/g,
};
```

### R8: GORM Extractor (Go)

**R8.1: Struct Tag Parsing**

```go
// Pattern matching for GORM struct tags
gorm_patterns = {
    // Model struct
    model: /type\s+(\w+)\s+struct\s*\{([^}]+)\}/gs,

    // Field with gorm tag
    field: /(\w+)\s+(\S+)\s+`[^`]*gorm:"([^"]+)"[^`]*`/g,

    // Embedded model
    embedded: /(\w+)\s+`gorm:"embedded"/g,
}

// Tag parsing
tag_patterns = {
    column: /column:(\w+)/,
    type: /type:(\w+)/,
    primaryKey: /primaryKey/,
    autoIncrement: /autoIncrement/,
    unique: /unique/,
    index: /index(?::(\w+))?/,
    foreignKey: /foreignKey:(\w+)/,
    references: /references:(\w+)/,
}
```

---

## Part 4: Data Classification

### R9: Sensitive Data Detection

**R9.1: Automatic Classification**

```typescript
interface DataClassificationRule {
  pattern: RegExp;
  classification: 'PII' | 'PHI' | 'PCI' | 'SENSITIVE';
  confidence: number;
}

const classificationRules: DataClassificationRule[] = [
  // PII - Personally Identifiable Information
  { pattern: /email|e_mail/i, classification: 'PII', confidence: 0.95 },
  { pattern: /phone|mobile|cell/i, classification: 'PII', confidence: 0.9 },
  { pattern: /address|street|city|zip|postal/i, classification: 'PII', confidence: 0.85 },
  { pattern: /ssn|social_security/i, classification: 'PII', confidence: 0.99 },
  { pattern: /passport|driver_license/i, classification: 'PII', confidence: 0.95 },
  { pattern: /date_of_birth|dob|birth_date/i, classification: 'PII', confidence: 0.9 },
  { pattern: /first_name|last_name|full_name/i, classification: 'PII', confidence: 0.8 },
  { pattern: /national_id|tax_id/i, classification: 'PII', confidence: 0.95 },

  // PHI - Protected Health Information
  { pattern: /diagnosis|condition|disease/i, classification: 'PHI', confidence: 0.9 },
  { pattern: /medication|prescription|drug/i, classification: 'PHI', confidence: 0.9 },
  { pattern: /medical_record|health_record/i, classification: 'PHI', confidence: 0.95 },
  { pattern: /insurance_id|policy_number/i, classification: 'PHI', confidence: 0.85 },
  { pattern: /blood_type|allergies/i, classification: 'PHI', confidence: 0.9 },

  // PCI - Payment Card Industry
  { pattern: /card_number|credit_card|cc_num/i, classification: 'PCI', confidence: 0.99 },
  { pattern: /cvv|cvc|security_code/i, classification: 'PCI', confidence: 0.99 },
  { pattern: /expiry|expiration|exp_date/i, classification: 'PCI', confidence: 0.8 },
  { pattern: /cardholder|card_holder/i, classification: 'PCI', confidence: 0.85 },
  { pattern: /account_number|routing_number/i, classification: 'PCI', confidence: 0.9 },

  // General sensitive
  { pattern: /password|passwd|secret/i, classification: 'SENSITIVE', confidence: 0.95 },
  { pattern: /api_key|token|auth/i, classification: 'SENSITIVE', confidence: 0.85 },
  { pattern: /salary|income|compensation/i, classification: 'SENSITIVE', confidence: 0.8 },
];
```

**R9.2: Decorator/Annotation Detection**

```typescript
// Look for explicit classification decorators
const classificationDecorators = [
  // Custom decorators
  /@SensitiveData\(['"](\w+)['"]\)/,
  /@PersonalData\(/,
  /@ProtectedHealth\(/,
  /@PaymentData\(/,
  /@Encrypted\(/,

  // Comments
  /\/\/\s*PII:/i,
  /\/\/\s*PHI:/i,
  /\/\/\s*SENSITIVE:/i,
  /#\s*PII:/i,  // Python
];
```

---

## Part 5: Query Pattern Analysis

### R10: Repository Method Analysis

**R10.1: Pattern Detection**

```typescript
interface QueryAnalysis {
  method_name: string;
  file: string;
  line: number;

  // Query characteristics
  operations: Array<{
    type: 'select' | 'insert' | 'update' | 'delete';
    entity: string;
  }>;

  // Joins
  joins: Array<{
    entity: string;
    type: 'inner' | 'left' | 'right';
    condition?: string;
  }>;

  // Performance concerns
  issues: Array<{
    type: 'n_plus_one' | 'missing_index' | 'full_scan' | 'cartesian';
    severity: 'warning' | 'error';
    description: string;
  }>;

  // Transaction
  transaction_scope?: 'required' | 'new' | 'none';
}
```

**R10.2: N+1 Detection**

```typescript
// Detect patterns like:
// users.forEach(user => user.posts)  // Lazy load in loop
// for user in users: user.orders     # Python

const nPlusOnePatterns = [
  // JavaScript/TypeScript
  /\.(?:forEach|map|filter)\s*\([^)]*\)\s*=>\s*\{?[^}]*\.\w+\s*(?:\[|\.)/g,

  // TypeORM lazy loading in loop
  /for\s*\([^)]+\)\s*\{[^}]*await\s+\w+\.\w+/g,

  // Python
  /for\s+\w+\s+in\s+\w+:\s*\n\s+\w+\.\w+/g,
];
```

---

## Part 6: Migration Tracking

### R11: Migration Analysis

**R11.1: Prisma Migrations**

```typescript
// Parse migrations/*/migration.sql
interface PrismaMigration {
  name: string;
  timestamp: string;
  sql_statements: string[];
  operations: Array<{
    type: 'CREATE TABLE' | 'ALTER TABLE' | 'DROP TABLE' |
          'CREATE INDEX' | 'DROP INDEX' | 'ADD COLUMN' | 'DROP COLUMN';
    target: string;
    details: Record<string, unknown>;
  }>;
}
```

**R11.2: TypeORM Migrations**

```typescript
// Parse TypeScript migration files
const typeormMigrationPatterns = {
  upMethod: /async\s+up\s*\([^)]*\)\s*:\s*Promise<void>\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s,
  downMethod: /async\s+down\s*\([^)]*\)\s*:\s*Promise<void>\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s,

  // Query runner methods
  createTable: /createTable\s*\(\s*new\s+Table\s*\(\s*\{([^}]+)\}/g,
  dropTable: /dropTable\s*\(\s*['"](\w+)['"]/g,
  addColumn: /addColumn\s*\(\s*['"](\w+)['"].*?new\s+TableColumn\s*\(\s*\{([^}]+)\}/g,
  dropColumn: /dropColumn\s*\(\s*['"](\w+)['"].*?['"](\w+)['"]/g,
  createIndex: /createIndex\s*\(\s*new\s+TableIndex\s*\(\s*\{([^}]+)\}/g,
};
```

**R11.3: Django Migrations**

```python
# Parse Python migration files
django_migration_patterns = {
    'dependencies': r'dependencies\s*=\s*\[([^\]]+)\]',
    'operations': r'operations\s*=\s*\[([\s\S]+?)\](?=\s*$|\s*class)',

    # Operations
    'create_model': r'migrations\.CreateModel\s*\(\s*name=[\'"](\w+)[\'"]',
    'delete_model': r'migrations\.DeleteModel\s*\(\s*name=[\'"](\w+)[\'"]',
    'add_field': r'migrations\.AddField\s*\([^)]+model_name=[\'"](\w+)[\'"][^)]+name=[\'"](\w+)[\'"]',
    'remove_field': r'migrations\.RemoveField\s*\([^)]+model_name=[\'"](\w+)[\'"][^)]+name=[\'"](\w+)[\'"]',
    'alter_field': r'migrations\.AlterField\s*\([^)]+model_name=[\'"](\w+)[\'"][^)]+name=[\'"](\w+)[\'"]',
}
```

---

## Part 7: Use Cases

### R12: Query Examples

**R12.1: Schema Understanding**

```cypher
// Get all entities and their fields
MATCH (e:Entity)-[:HAS_FIELD]->(f:Field)
RETURN e.name, collect({name: f.name, type: f.database_type, nullable: f.is_nullable})

// Find all relationships from User
MATCH (e:Entity {name: 'User'})-[r:RELATES_TO]->(target:Entity)
RETURN target.name, r.cardinality, r.foreign_key_field

// Find join path between two entities
MATCH path = shortestPath((a:Entity {name: 'User'})-[:RELATES_TO*]-(b:Entity {name: 'Invoice'}))
RETURN path
```

**R12.2: Impact Analysis**

```cypher
// What code queries User entity?
MATCH (f:Function)-[:QUERIES]->(e:Entity {name: 'User'})
RETURN f.name, f.file

// If I add NOT NULL to email, what breaks?
MATCH (f:Field {name: 'email', is_nullable: true})<-[:HAS_FIELD]-(e:Entity)
MATCH (func:Function)-[:QUERIES]->(e)
WHERE func.file CONTAINS 'Repository'
RETURN func.name, func.file

// Find all PII fields
MATCH (f:Field)
WHERE f.data_classification = 'PII'
RETURN f.entity, f.name, f.data_classification
```

**R12.3: Performance Analysis**

```cypher
// Find potential N+1 queries
MATCH (q:QueryPattern)
WHERE q.potential_n_plus_one = true
RETURN q.name, q.file, q.line

// Find unindexed foreign keys
MATCH (f:Field {is_foreign_key: true})
WHERE NOT (f)-[:INDEXED_BY]->(:Index)
RETURN f.entity, f.name as fk_field
```

---

## Part 8: Integration

### R13: Mesh Builder Integration

**R13.1: Schema Files**

Create ORM-specific schemas:
- `schemas/orms/prisma.json`
- `schemas/orms/typeorm.json`
- `schemas/orms/sqlalchemy.json`
- `schemas/orms/django.json`
- `schemas/orms/sequelize.json`

**R13.2: Extractor Classes**

```typescript
// src/mesh-builder/src/extractors/data/
export class PrismaExtractor extends BaseDataExtractor { ... }
export class TypeORMExtractor extends BaseDataExtractor { ... }
export class SQLAlchemyExtractor extends BaseDataExtractor { ... }
export class DjangoExtractor extends BaseDataExtractor { ... }
export class SequelizeExtractor extends BaseDataExtractor { ... }
export class GORMExtractor extends BaseDataExtractor { ... }
```

**R13.3: Data Classification Service**

```typescript
// src/mesh-builder/src/services/DataClassifier.ts
export class DataClassifier {
  classifyField(field: FieldNode): DataClassification | null;
  classifyEntity(entity: EntityNode): DataClassification[];
  generateComplianceReport(): ComplianceReport;
}
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Prisma model extraction accuracy | > 98% |
| TypeORM entity extraction | > 95% |
| SQLAlchemy model extraction | > 95% |
| Django model extraction | > 95% |
| Relationship detection accuracy | > 90% |
| Index extraction accuracy | > 95% |
| Data classification recall | > 85% |
| Migration parsing accuracy | > 90% |
| N+1 detection precision | > 80% |
| Extraction time (100 entities) | < 5s |

---

## Implementation Phases

### Phase 1: Core ORM Support (P0)
- Prisma schema parsing
- TypeORM decorator extraction
- Entity/Field/Relationship nodes
- Basic index extraction

### Phase 2: Python ORMs (P0)
- SQLAlchemy model extraction
- Django model extraction
- Migration file parsing

### Phase 3: Data Classification (P1)
- Automatic PII/PHI/PCI detection
- Custom decorator support
- Compliance reporting

### Phase 4: Query Analysis (P1)
- Repository pattern detection
- N+1 query identification
- Transaction boundary analysis

### Phase 5: Advanced Features (P2)
- Migration dependency graph
- Schema diff generation
- Cross-database relationships

---

## Open Questions

1. **Database Introspection**: Should we support live database introspection in addition to code analysis?
2. **SQL Parsing**: How deeply should we parse raw SQL queries?
3. **Multi-Database**: How to handle applications with multiple databases?
4. **GraphQL**: Should we include GraphQL schema extraction here or separate?

---

## References

- Prisma Schema Reference: https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference
- TypeORM Documentation: https://typeorm.io/
- SQLAlchemy ORM: https://docs.sqlalchemy.org/en/20/orm/
- Django Models: https://docs.djangoproject.com/en/5.0/topics/db/models/
