# REQ-041: Testing & Quality Extraction

**Status:** Draft
**Priority:** P3
**Created:** 2026-01-15
**Author:** Doug / Claude
**Depends On:** REQ-033 (Code Knowledge Mesh), REQ-034 (Extraction Context Provider)
**Layer:** L3 (draagon-forge) - Programming-specific

---

## Summary

Extract semantic knowledge from test suites, test coverage, mocks/stubs, and quality metrics. Enable the Code Knowledge Mesh to understand not just "what code exists" but "how well it's tested, what scenarios are covered, and where quality gaps exist."

**Key Capabilities:**
- **Test Suite Extraction**: Test files, describe blocks, test cases
- **Coverage Mapping**: Which tests cover which code
- **Mock/Stub Analysis**: What's mocked, dependency injection patterns
- **Test Type Classification**: Unit, integration, e2e categorization
- **Test Fixture Extraction**: Factories, fixtures, test data
- **Quality Gap Detection**: Untested code, missing edge cases

---

## Problem Statement

### Why Testing Extraction Matters

Tests are documentation, but scattered and hard to navigate:

```typescript
// What structural extraction sees:
// - File: user.service.spec.ts
// - Function: it('should create user')

// What we NEED to understand:
// - This tests UserService.create()
// - Covers: valid input, duplicate email, weak password
// - Does NOT cover: rate limiting, concurrent creation
// - Mocks: UserRepository, EmailService
// - Uses fixtures: createUserDto, mockUser
// - Integration test (hits database)
// - 85% branch coverage for create() method
```

### The Test Knowledge Problem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     TEST KNOWLEDGE SCATTERED                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   Test Files    │  │   Coverage      │  │   Test Reports              │ │
│  │   *.spec.ts     │  │   Reports       │  │   (CI artifacts)            │ │
│  │   *.test.ts     │  │   (json/html)   │  │                            │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│         │                    │                        │                     │
│         │                    │                        │                     │
│     What tests          What's               What failed/                  │
│     exist               covered              passed when                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Questions We Can't Answer Today

- What tests cover the `processPayment()` method?
- Is there an integration test for the checkout flow?
- What code paths in `OrderService` have no test coverage?
- What mocks does the `UserService` test suite use?
- Are there flaky tests? Which ones?
- What test fixtures exist for `Order` entities?

---

## Solution Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    TESTING EXTRACTION                                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    FRAMEWORK DETECTION                                   │   │
│  │   Jest | Vitest | Mocha | pytest | JUnit | RSpec | xUnit                │   │
│  └──────────────────────────────────┬──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │               FRAMEWORK-SPECIFIC EXTRACTORS                              │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │   │
│  │  │    Jest     │ │   pytest    │ │    JUnit    │ │     Vitest      │   │   │
│  │  │  Extractor  │ │  Extractor  │ │  Extractor  │ │   Extractor     │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘   │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                    TEST GRAPH NODES                                      │   │
│  │  TestSuite | TestCase | Mock | Fixture | CoverageMap | TestRun          │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                    RELATIONSHIP EDGES                                    │   │
│  │  TESTS | MOCKS | USES_FIXTURE | COVERS | DEPENDS_ON                     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Graph Schema - Test Nodes

### R1: Test Structure Nodes

**R1.1: TestSuite Node Type**

```typescript
interface TestSuiteNode {
  type: 'TestSuite';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Framework
  framework: 'jest' | 'vitest' | 'mocha' | 'pytest' | 'junit' | 'rspec' | 'xunit' | 'playwright';

  // Hierarchy
  parent_suite?: string;
  child_suites: string[];

  // Test count
  test_count: number;
  skip_count: number;
  todo_count: number;

  // Test type
  test_type: 'unit' | 'integration' | 'e2e' | 'performance' | 'smoke' | 'unknown';

  // Target
  tests_module?: string;  // What module/class this suite tests
  tests_file?: string;    // Source file being tested

  // Setup/Teardown
  has_before_all: boolean;
  has_before_each: boolean;
  has_after_all: boolean;
  has_after_each: boolean;

  // Tags/Markers
  tags: string[];
}
```

**R1.2: TestCase Node Type**

```typescript
interface TestCaseNode {
  type: 'TestCase';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Parent
  suite: string;

  // Status
  status: 'enabled' | 'skipped' | 'todo' | 'focused';

  // What it tests
  tests_function?: string;
  tests_class?: string;
  tests_method?: string;
  tests_scenario?: string;  // For BDD

  // Assertions
  assertion_count: number;
  assertion_types: string[];  // expect, assert, toBe, toEqual, etc.

  // Async
  is_async: boolean;
  timeout_ms?: number;

  // Parameterized
  is_parameterized: boolean;
  parameter_sets?: number;

  // Tags
  tags: string[];

  // Historical
  is_flaky?: boolean;
  flaky_rate?: number;
  avg_duration_ms?: number;
}
```

### R2: Mock/Stub Nodes

**R2.1: MockDefinition Node Type**

```typescript
interface MockDefinitionNode {
  type: 'MockDefinition';
  name: string;
  file: string;
  line: number;

  // What's mocked
  mocks_type: 'module' | 'class' | 'function' | 'constant' | 'object';
  mocks_target: string;  // Module path or class name
  mocks_method?: string; // Specific method if class mock

  // Mock type
  mock_type: 'jest.mock' | 'jest.spyOn' | 'sinon' | 'unittest.mock' | 'mockito' | 'vitest.mock';

  // Implementation
  has_implementation: boolean;
  returns_value?: string;
  is_spy: boolean;

  // Scope
  scope: 'file' | 'suite' | 'test';

  // Usage
  used_in_tests: string[];
}
```

**R2.2: MockUsage Node Type**

```typescript
interface MockUsageNode {
  type: 'MockUsage';
  mock_name: string;
  test_case: string;
  file: string;
  line: number;

  // Verification
  verification_type?: 'called' | 'calledWith' | 'calledTimes' | 'never' | 'order';
  expected_calls?: number;
  expected_args?: string;

  // Reset
  is_reset_before: boolean;
  is_cleared_after: boolean;
}
```

### R3: Fixture/Factory Nodes

**R3.1: TestFixture Node Type**

```typescript
interface TestFixtureNode {
  type: 'TestFixture';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Fixture type
  fixture_type: 'factory' | 'builder' | 'static' | 'json' | 'database';

  // Creates
  creates_type: string;  // Entity/DTO type

  // Customization
  supports_overrides: boolean;
  default_traits?: string[];
  available_traits?: string[];

  // Relationships
  depends_on_fixtures: string[];

  // Database
  creates_db_records: boolean;
  auto_cleanup: boolean;

  // Usage
  used_in_suites: string[];
}
```

**R3.2: TestData Node Type**

```typescript
interface TestDataNode {
  type: 'TestData';
  name: string;
  file: string;
  line: number;

  // Data type
  data_type: 'constant' | 'function' | 'json_file' | 'csv_file';

  // Schema
  value_type: string;
  sample_value?: string;

  // Variations
  variations: Array<{
    name: string;
    description?: string;
    scenario: string;  // 'valid', 'invalid_email', 'edge_case'
  }>;

  // Usage
  used_in_tests: string[];
}
```

### R4: Coverage Nodes

**R4.1: CoverageMap Node Type**

```typescript
interface CoverageMapNode {
  type: 'CoverageMap';
  source_file: string;
  report_date: string;

  // Metrics
  line_coverage: number;       // 0-100
  branch_coverage: number;     // 0-100
  function_coverage: number;   // 0-100
  statement_coverage: number;  // 0-100

  // Details
  lines_total: number;
  lines_covered: number;
  branches_total: number;
  branches_covered: number;
  functions_total: number;
  functions_covered: number;

  // Uncovered
  uncovered_lines: number[];
  uncovered_branches: Array<{
    line: number;
    branch: number;
  }>;
  uncovered_functions: string[];
}
```

**R4.2: FunctionCoverage Node Type**

```typescript
interface FunctionCoverageNode {
  type: 'FunctionCoverage';
  function_name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Coverage
  is_covered: boolean;
  call_count: number;

  // Branch coverage within function
  branches_total: number;
  branches_covered: number;
  uncovered_branches: number[];

  // Test mapping
  covered_by_tests: string[];  // Test case names
}
```

### R5: Test Run Nodes

**R5.1: TestRun Node Type**

```typescript
interface TestRunNode {
  type: 'TestRun';
  run_id: string;
  timestamp: string;
  duration_ms: number;

  // Environment
  environment: string;  // 'ci', 'local', 'staging'
  branch?: string;
  commit?: string;

  // Results
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;

  // Performance
  slowest_tests: Array<{
    name: string;
    duration_ms: number;
  }>;

  // Failures
  failures: Array<{
    test_name: string;
    error_message: string;
    stack_trace?: string;
  }>;
}
```

---

## Part 2: Graph Schema - Test Edges

### R6: Relationship Types

**R6.1: TESTS Edge**

```typescript
interface TestsEdge {
  type: 'TESTS';
  from: TestCaseNode;
  to: FunctionNode | ClassNode | MethodNode;

  // Coverage type
  coverage_type: 'direct' | 'indirect' | 'integration';

  // Inferred or explicit
  is_explicit: boolean;  // Named in test description
}
```

**R6.2: MOCKS Edge**

```typescript
interface MocksEdge {
  type: 'MOCKS';
  from: TestCaseNode | TestSuiteNode;
  to: MockDefinitionNode;
}
```

**R6.3: USES_FIXTURE Edge**

```typescript
interface UsesFixtureEdge {
  type: 'USES_FIXTURE';
  from: TestCaseNode;
  to: TestFixtureNode;

  with_overrides: boolean;
  traits_used?: string[];
}
```

**R6.4: COVERS Edge**

```typescript
interface CoversEdge {
  type: 'COVERS';
  from: TestCaseNode;
  to: FunctionCoverageNode;

  lines_covered: number[];
  branches_covered: number[];
}
```

**R6.5: DEPENDS_ON Edge (Test)**

```typescript
interface TestDependsOnEdge {
  type: 'DEPENDS_ON';
  from: TestCaseNode;
  to: TestCaseNode;

  dependency_type: 'data' | 'state' | 'order';
}
```

---

## Part 3: Framework-Specific Extractors

### R7: Jest/Vitest Extractor

**R7.1: Test Structure Patterns**

```typescript
const jestPatterns = {
  // Describe blocks
  describe: /describe\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{/g,
  describeEach: /describe\.each\s*\(([^)]+)\)\s*\(\s*['"`]([^'"`]+)['"`]/g,

  // Test cases
  it: /(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(?:async\s*)?\(?/g,
  itEach: /(?:it|test)\.each\s*\(([^)]+)\)\s*\(\s*['"`]([^'"`]+)['"`]/g,

  // Skipped/focused
  skip: /(?:it|test|describe)\.skip\s*\(/g,
  only: /(?:it|test|describe)\.only\s*\(/g,
  todo: /(?:it|test)\.todo\s*\(\s*['"`]([^'"`]+)['"`]/g,

  // Lifecycle
  beforeAll: /beforeAll\s*\(/g,
  beforeEach: /beforeEach\s*\(/g,
  afterAll: /afterAll\s*\(/g,
  afterEach: /afterEach\s*\(/g,

  // Assertions
  expect: /expect\s*\(/g,
  toBe: /\.toBe\s*\(/g,
  toEqual: /\.toEqual\s*\(/g,
  toThrow: /\.toThrow\s*\(/g,
  toHaveBeenCalled: /\.toHaveBeenCalled(?:With|Times)?\s*\(/g,
};
```

**R7.2: Mock Patterns**

```typescript
const jestMockPatterns = {
  // Module mocks
  jestMock: /jest\.mock\s*\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*\(\s*\)\s*=>\s*\{|\s*,\s*\{)?/g,

  // Spy
  spyOn: /jest\.spyOn\s*\(\s*(\w+)\s*,\s*['"`](\w+)['"`]\)/g,

  // Function mocks
  jestFn: /jest\.fn\s*\(\s*\)?/g,
  mockImplementation: /\.mockImplementation\s*\(/g,
  mockReturnValue: /\.mockReturnValue\s*\(/g,
  mockResolvedValue: /\.mockResolvedValue\s*\(/g,
  mockRejectedValue: /\.mockRejectedValue\s*\(/g,

  // Assertions on mocks
  toHaveBeenCalled: /\.toHaveBeenCalled\s*\(\s*\)/g,
  toHaveBeenCalledWith: /\.toHaveBeenCalledWith\s*\(/g,
  toHaveBeenCalledTimes: /\.toHaveBeenCalledTimes\s*\(\s*(\d+)\s*\)/g,

  // Reset/Clear
  mockClear: /\.mockClear\s*\(\s*\)/g,
  mockReset: /\.mockReset\s*\(\s*\)/g,
  mockRestore: /\.mockRestore\s*\(\s*\)/g,
};
```

### R8: pytest Extractor

**R8.1: Test Patterns**

```python
pytest_patterns = {
    # Test functions
    'test_function': r'^def\s+(test_\w+)\s*\(',
    'async_test': r'^async\s+def\s+(test_\w+)\s*\(',

    # Test classes
    'test_class': r'^class\s+(Test\w+)\s*(?:\(|:)',

    # Fixtures
    'fixture': r'@pytest\.fixture(?:\(([^)]*)\))?\s*\n\s*def\s+(\w+)',
    'fixture_usage': r'def\s+test_\w+\s*\([^)]*(\w+)[^)]*\)',

    # Parametrize
    'parametrize': r'@pytest\.mark\.parametrize\s*\(\s*[\'"]([^\'"]+)[\'"],\s*\[([^\]]+)\]',

    # Markers
    'skip': r'@pytest\.mark\.skip',
    'skipif': r'@pytest\.mark\.skipif',
    'xfail': r'@pytest\.mark\.xfail',
    'usefixtures': r'@pytest\.mark\.usefixtures\s*\(\s*[\'"]([^\'"]+)[\'"]',

    # Setup/Teardown
    'setup_method': r'def\s+setup_method\s*\(',
    'teardown_method': r'def\s+teardown_method\s*\(',
    'setup_class': r'def\s+setup_class\s*\(',
    'teardown_class': r'def\s+teardown_class\s*\(',
}
```

**R8.2: Mock Patterns (unittest.mock)**

```python
pytest_mock_patterns = {
    # Mock decorator
    'patch_decorator': r'@(?:mock\.)?patch\s*\(\s*[\'"]([^\'"]+)[\'"]',
    'patch_object': r'@(?:mock\.)?patch\.object\s*\(\s*(\w+)\s*,\s*[\'"](\w+)[\'"]',

    # Context manager
    'patch_context': r'with\s+(?:mock\.)?patch\s*\(\s*[\'"]([^\'"]+)[\'"]',

    # mocker fixture (pytest-mock)
    'mocker_patch': r'mocker\.patch\s*\(\s*[\'"]([^\'"]+)[\'"]',
    'mocker_spy': r'mocker\.spy\s*\(\s*(\w+)\s*,\s*[\'"](\w+)[\'"]',

    # MagicMock
    'magic_mock': r'MagicMock\s*\(',
    'mock_spec': r'Mock\s*\(\s*spec=(\w+)',
}
```

### R9: JUnit Extractor

**R9.1: Java Test Patterns**

```typescript
const junitPatterns = {
  // Test annotations
  test: /@Test\s*(?:\([^)]*\))?\s*(?:public\s+)?void\s+(\w+)/g,
  displayName: /@DisplayName\s*\(\s*['"]([^'"]+)['"]\s*\)/g,

  // Lifecycle
  beforeAll: /@BeforeAll/g,
  beforeEach: /@BeforeEach/g,
  afterAll: /@AfterAll/g,
  afterEach: /@AfterEach/g,

  // Disabled
  disabled: /@Disabled(?:\s*\(\s*['"]([^'"]+)['"]\s*\))?/g,

  // Parameterized
  parameterizedTest: /@ParameterizedTest/g,
  valueSource: /@ValueSource\s*\(\s*(\w+)\s*=\s*\{([^}]+)\}/g,
  methodSource: /@MethodSource\s*\(\s*['"]([^'"]+)['"]\s*\)/g,

  // Nested tests
  nested: /@Nested/g,

  // Assertions
  assertEquals: /assertEquals\s*\(/g,
  assertTrue: /assertTrue\s*\(/g,
  assertThrows: /assertThrows\s*\(/g,
  assertThat: /assertThat\s*\(/g,
};
```

**R9.2: Mockito Patterns**

```typescript
const mockitoPatterns = {
  // Annotations
  mock: /@Mock\s+(?:private\s+)?(\w+)\s+(\w+)/g,
  injectMocks: /@InjectMocks/g,
  spy: /@Spy/g,
  captor: /@Captor/g,

  // Stubbing
  when: /when\s*\(\s*(\w+)\.(\w+)\s*\(/g,
  thenReturn: /\.thenReturn\s*\(/g,
  thenThrow: /\.thenThrow\s*\(/g,

  // Verification
  verify: /verify\s*\(\s*(\w+)(?:\s*,\s*(\w+)\s*\()?\s*\)\s*\.(\w+)/g,
  verifyNoInteractions: /verifyNoInteractions\s*\(/g,
  verifyNoMoreInteractions: /verifyNoMoreInteractions\s*\(/g,
};
```

### R10: Playwright/Cypress E2E Extractor

**R10.1: E2E Test Patterns**

```typescript
const e2ePatterns = {
  // Playwright
  playwrightTest: /test\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*async\s*\(\s*\{\s*page/g,
  playwrightDescribe: /test\.describe\s*\(\s*['"`]([^'"`]+)['"`]/g,

  // Page interactions
  goto: /page\.goto\s*\(\s*['"`]([^'"`]+)['"`]/g,
  click: /page\.click\s*\(\s*['"`]([^'"`]+)['"`]/g,
  fill: /page\.fill\s*\(\s*['"`]([^'"`]+)['"`]/g,
  locator: /page\.locator\s*\(\s*['"`]([^'"`]+)['"`]/g,

  // Assertions
  expect: /expect\s*\(\s*page/g,
  toBeVisible: /\.toBeVisible\s*\(/g,
  toHaveText: /\.toHaveText\s*\(/g,

  // Cypress
  cypressDescribe: /describe\s*\(\s*['"`]([^'"`]+)['"`]/g,
  cypressIt: /it\s*\(\s*['"`]([^'"`]+)['"`]/g,
  cyGet: /cy\.get\s*\(\s*['"`]([^'"`]+)['"`]/g,
  cyVisit: /cy\.visit\s*\(\s*['"`]([^'"`]+)['"`]/g,
  cyIntercept: /cy\.intercept\s*\(/g,
};
```

---

## Part 4: Coverage Analysis

### R11: Coverage Report Parsing

**R11.1: Istanbul/NYC Coverage**

```typescript
interface IstanbulCoverageReport {
  [filePath: string]: {
    path: string;
    statementMap: Record<string, { start: Location; end: Location }>;
    fnMap: Record<string, { name: string; decl: Location; loc: Location }>;
    branchMap: Record<string, { type: string; locations: Location[] }>;
    s: Record<string, number>;  // Statement hits
    f: Record<string, number>;  // Function hits
    b: Record<string, number[]>;  // Branch hits
  };
}

// Parse and extract
function parseCoverageReport(reportPath: string): CoverageMapNode[] {
  // Read coverage-summary.json or coverage-final.json
  // Transform to CoverageMapNode
}
```

**R11.2: Coverage Thresholds**

```typescript
interface CoverageThresholds {
  global: {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
  };
  per_file?: Record<string, {
    lines?: number;
    branches?: number;
    functions?: number;
  }>;
}
```

### R12: Test-to-Code Mapping

**R12.1: Explicit Mapping**

```typescript
// From test naming conventions
const testMappingPatterns = {
  // File naming: user.service.spec.ts → user.service.ts
  fileNaming: /^(.+)\.(?:spec|test)\.(ts|js|tsx|jsx)$/,

  // Describe block: 'UserService' → class UserService
  describeMapping: /describe\s*\(\s*['"`](\w+)['"`]/,

  // Test name: 'should create user' → method create
  methodInference: /should\s+(\w+)/,
};
```

**R12.2: Coverage-Based Mapping**

```typescript
// From coverage data
interface TestCoverageMapping {
  test_name: string;
  covered_files: Array<{
    file: string;
    functions: string[];
    lines: number[];
  }>;
}
```

---

## Part 5: Quality Gap Detection

### R13: Untested Code Detection

**R13.1: Coverage Gaps**

```typescript
interface CoverageGapAnalysis {
  // Completely untested files
  untested_files: string[];

  // Functions without tests
  untested_functions: Array<{
    file: string;
    function_name: string;
    line: number;
    complexity?: number;
  }>;

  // Low coverage files
  low_coverage_files: Array<{
    file: string;
    line_coverage: number;
    branch_coverage: number;
    critical_uncovered: string[];  // Important uncovered functions
  }>;

  // Untested branches (conditionals)
  untested_branches: Array<{
    file: string;
    line: number;
    condition: string;
    branch_type: 'if' | 'else' | 'case' | 'ternary';
  }>;
}
```

**R13.2: Missing Test Scenarios**

```typescript
interface MissingTestAnalysis {
  function_name: string;
  file: string;

  // Suggested test cases
  suggested_tests: Array<{
    scenario: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    reason: string;  // Why this test is important
  }>;

  // Error handling not tested
  uncovered_error_paths: Array<{
    error_type: string;
    line: number;
    condition: string;
  }>;

  // Edge cases
  uncovered_edge_cases: Array<{
    input_type: string;
    description: string;
    example: string;
  }>;
}
```

### R14: Test Quality Analysis

**R14.1: Test Smells Detection**

```typescript
interface TestSmellAnalysis {
  test_file: string;

  smells: Array<{
    type: TestSmellType;
    location: string;
    description: string;
    suggestion: string;
  }>;
}

type TestSmellType =
  | 'assertion_roulette'      // Multiple assertions without clear failure message
  | 'eager_test'              // Tests multiple behaviors
  | 'lazy_test'               // Not enough assertions
  | 'mystery_guest'           // Uses external resources implicitly
  | 'sensitive_equality'      // Depends on implementation details
  | 'test_code_duplication'   // Copy-paste tests
  | 'commented_test'          // Commented out test code
  | 'magic_number'            // Unexplained constants
  | 'sleeping_test'           // Uses setTimeout/sleep
  | 'general_fixture'         // Fixture not specific to test
  | 'flaky_test';             // Non-deterministic
```

**R14.2: Flaky Test Detection**

```typescript
interface FlakyTestAnalysis {
  test_name: string;
  file: string;

  // Historical data
  total_runs: number;
  failure_count: number;
  flaky_rate: number;

  // Patterns
  failure_patterns: Array<{
    error_type: string;
    occurrence_rate: number;
  }>;

  // Likely causes
  likely_causes: Array<{
    cause: 'timing' | 'order_dependent' | 'external_dependency' | 'race_condition' | 'random_data';
    evidence: string;
    confidence: number;
  }>;
}
```

---

## Part 6: Use Cases

### R15: Query Examples

**R15.1: Test Discovery**

```cypher
// Get all tests for a specific function
MATCH (t:TestCase)-[:TESTS]->(f:Function {name: 'processPayment'})
RETURN t.name, t.file, t.status

// Find untested public functions
MATCH (f:Function)
WHERE f.visibility = 'public'
AND NOT (f)<-[:TESTS]-()
RETURN f.name, f.file

// Get test coverage for a module
MATCH (f:Function)-[:BELONGS_TO]->(m:Module {name: 'OrderService'})
OPTIONAL MATCH (t:TestCase)-[:TESTS]->(f)
RETURN f.name, count(t) as test_count
```

**R15.2: Mock Analysis**

```cypher
// What does UserService test mock?
MATCH (s:TestSuite {tests_module: 'UserService'})-[:MOCKS]->(m:MockDefinition)
RETURN m.mocks_target, m.mocks_method

// Find over-mocked tests (too many mocks)
MATCH (t:TestCase)-[:MOCKS]->(m:MockDefinition)
WITH t, count(m) as mock_count
WHERE mock_count > 5
RETURN t.name, mock_count
```

**R15.3: Coverage Gaps**

```cypher
// Files with low coverage
MATCH (c:CoverageMap)
WHERE c.branch_coverage < 80
RETURN c.source_file, c.line_coverage, c.branch_coverage

// Functions without any test coverage
MATCH (fc:FunctionCoverage)
WHERE fc.is_covered = false
RETURN fc.function_name, fc.file
```

---

## Part 7: Integration

### R16: Mesh Builder Integration

**R16.1: Schema Files**

```
schemas/testing/
├── jest-vitest.json
├── pytest.json
├── junit.json
├── playwright-cypress.json
├── mocks.json
└── coverage.json
```

**R16.2: Extractor Classes**

```typescript
// src/mesh-builder/src/extractors/testing/
export class JestExtractor extends BaseTestExtractor { ... }
export class PytestExtractor extends BaseTestExtractor { ... }
export class JUnitExtractor extends BaseTestExtractor { ... }
export class E2EExtractor extends BaseTestExtractor { ... }
export class CoverageExtractor extends BaseTestExtractor { ... }
export class MockExtractor extends BaseTestExtractor { ... }
```

**R16.3: Test Report Generator**

```typescript
// Generate test documentation and reports
export class TestReportGenerator {
  generateTestMatrix(): TestMatrix;  // Function → Tests mapping
  generateCoverageReport(): CoverageReport;
  generateGapAnalysis(): CoverageGapAnalysis;
  generateFlakyTestReport(): FlakyTestAnalysis[];
}
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Jest test detection accuracy | > 98% |
| pytest test detection | > 95% |
| Mock extraction accuracy | > 90% |
| Test-to-code mapping | > 85% |
| Coverage report parsing | > 98% |
| Flaky test detection | > 80% |
| Test smell detection | > 75% |
| Extraction time (1000 tests) | < 30s |

---

## Implementation Phases

### Phase 1: Test Structure (P3)
- Jest/Vitest test extraction
- pytest test extraction
- Test suite hierarchy
- Basic test categorization

### Phase 2: Mocks & Fixtures (P3)
- Jest mock extraction
- pytest fixture extraction
- Mock usage tracking
- Fixture dependency mapping

### Phase 3: Coverage Integration (P3)
- Istanbul coverage parsing
- Test-to-code mapping
- Coverage gap detection
- Function-level coverage

### Phase 4: Quality Analysis (P3)
- Test smell detection
- Flaky test analysis
- Missing test suggestions
- Test documentation generation

---

## Open Questions

1. **Real-time Coverage**: Should we support real-time coverage during development?
2. **Mutation Testing**: Should we integrate mutation testing results?
3. **Visual Testing**: How to handle visual/snapshot test extraction?
4. **Test Generation**: Should we suggest/generate tests for uncovered code?

---

## References

- Jest Documentation: https://jestjs.io/docs/getting-started
- pytest Documentation: https://docs.pytest.org/
- JUnit 5: https://junit.org/junit5/docs/current/user-guide/
- Istanbul Coverage: https://istanbul.js.org/
- Playwright Testing: https://playwright.dev/docs/test-intro
