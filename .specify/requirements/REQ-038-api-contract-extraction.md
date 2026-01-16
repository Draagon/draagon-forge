# REQ-038: API Contracts & Integration Extraction

**Status:** Draft
**Priority:** P1
**Created:** 2026-01-15
**Author:** Doug / Claude
**Depends On:** REQ-033 (Code Knowledge Mesh), REQ-034 (Extraction Context Provider)
**Layer:** L3 (draagon-forge) - Programming-specific

---

## Summary

Extract semantic knowledge from API contracts, including request/response schemas, validation rules, authentication requirements, error handling, and external service integrations. Enable the Code Knowledge Mesh to understand not just "what endpoints exist" but "what data flows through them, how they're protected, and what external services they depend on."

**Key Capabilities:**
- **Request/Response Schema Extraction**: DTOs, validation rules, content types
- **Authentication/Authorization Mapping**: Guards, middleware, role requirements
- **Error Response Cataloging**: Exception → HTTP status mapping
- **Rate Limiting Detection**: Throttling configuration per endpoint
- **API Versioning Analysis**: Version strategies and compatibility
- **External API Integration**: Third-party service calls and their contracts

---

## Problem Statement

### Why API Contract Extraction Matters

APIs are the contracts between services. Understanding them enables:

```typescript
// What structural extraction sees:
// - Decorator: @Post('/orders')
// - Parameter: body: CreateOrderDto
// - Return type: Order

// What we NEED to understand:
// - Request body requires: { items: [{productId, quantity}], shippingAddress }
// - items[].quantity must be > 0 (validation)
// - Requires Bearer JWT token with 'orders:write' scope
// - Returns 201 on success, 400 on validation error, 401 on auth failure
// - Rate limited to 100 req/min per user
// - Calls Stripe API for payment processing
// - Part of API v2 (breaking changes from v1)
```

### The API Documentation Problem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                WHERE API KNOWLEDGE LIVES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   OpenAPI/      │  │   Code          │  │   Framework                 │ │
│  │   Swagger       │  │   Decorators    │  │   Middleware                │ │
│  │   (if exists)   │  │   (if used)     │  │   (implicit)                │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│         ↓                    ↓                       ↓                      │
│     May be          Code is truth          Often undocumented              │
│     out of sync     but incomplete         auth/validation                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Questions We Can't Answer Today

- What fields does the `/users` POST endpoint require?
- Which endpoints require admin permissions?
- What happens if validation fails on `/orders`?
- What third-party APIs does our system call?
- Are there breaking changes between API v1 and v2?
- What's the rate limit on the `/search` endpoint?

---

## Solution Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      API CONTRACT EXTRACTION                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    FRAMEWORK DETECTION                                   │   │
│  │   NestJS | Express | FastAPI | Django REST | Spring | ASP.NET           │   │
│  └──────────────────────────────────┬──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │               FRAMEWORK-SPECIFIC EXTRACTORS                              │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │   │
│  │  │   NestJS    │ │   FastAPI   │ │  Express    │ │  Django REST    │   │   │
│  │  │  Extractor  │ │  Extractor  │ │  Extractor  │ │   Extractor     │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘   │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                    API GRAPH NODES                                       │   │
│  │  Endpoint | RequestSchema | ResponseSchema | Auth | RateLimit | Error   │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                    RELATIONSHIP EDGES                                    │   │
│  │  ACCEPTS | RETURNS | REQUIRES_AUTH | RATE_LIMITED | CALLS_EXTERNAL      │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Graph Schema - API Nodes

### R1: Endpoint Nodes

**R1.1: APIEndpoint Node Type**

```typescript
interface APIEndpointNode {
  type: 'APIEndpoint';
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';
  path: string;  // /users/:id
  file: string;
  line: number;

  // Handler
  handler_function: string;
  controller_class?: string;

  // Path parameters
  path_params: Array<{
    name: string;
    type: string;
    validation?: string;
  }>;

  // Query parameters
  query_params: Array<{
    name: string;
    type: string;
    required: boolean;
    default?: string;
    validation?: string;
  }>;

  // Request body
  request_body?: {
    content_type: string;  // application/json
    schema: string;  // Reference to RequestSchema node
    required: boolean;
  };

  // Response
  responses: Array<{
    status_code: number;
    description?: string;
    content_type: string;
    schema?: string;  // Reference to ResponseSchema node
  }>;

  // Versioning
  api_version?: string;
  deprecated: boolean;
  deprecated_in_version?: string;
  replaced_by?: string;

  // Documentation
  summary?: string;
  description?: string;
  tags: string[];

  // Operation ID (for OpenAPI)
  operation_id?: string;
}
```

**R1.2: RequestSchema Node Type**

```typescript
interface RequestSchemaNode {
  type: 'RequestSchema';
  name: string;  // DTO class name
  file: string;
  line: number;

  // Content type
  content_type: string;  // application/json, multipart/form-data, etc.

  // Schema
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    nullable: boolean;
    default?: string;

    // Validation
    validation: Array<{
      rule: string;  // min, max, pattern, enum, etc.
      value: string | number;
      message?: string;
    }>;

    // Nested objects
    is_nested: boolean;
    nested_schema?: string;

    // Arrays
    is_array: boolean;
    array_item_type?: string;
  }>;

  // Transformation
  transformations: Array<{
    field: string;
    transform: 'trim' | 'lowercase' | 'uppercase' | 'toNumber' | 'toBoolean' | 'custom';
  }>;

  // Groups (for partial validation)
  validation_groups?: string[];
}
```

**R1.3: ResponseSchema Node Type**

```typescript
interface ResponseSchemaNode {
  type: 'ResponseSchema';
  name: string;
  file: string;
  line: number;

  // Status codes this is used for
  status_codes: number[];

  // Schema
  fields: Array<{
    name: string;
    type: string;
    nullable: boolean;
    description?: string;

    // Serialization
    expose: boolean;
    exclude_if?: string;  // Conditional exclusion
    transform?: string;   // Serialization transform

    // Nested
    is_nested: boolean;
    nested_schema?: string;
  }>;

  // Pagination (if applicable)
  is_paginated: boolean;
  pagination_fields?: {
    items_field: string;
    total_field?: string;
    page_field?: string;
    limit_field?: string;
  };
}
```

### R2: Authentication/Authorization Nodes

**R2.1: AuthRequirement Node Type**

```typescript
interface AuthRequirementNode {
  type: 'AuthRequirement';
  name: string;
  file: string;
  line: number;

  // Auth type
  auth_type: 'jwt' | 'api_key' | 'basic' | 'oauth2' | 'session' | 'custom';

  // Token location
  token_location?: 'header' | 'query' | 'cookie' | 'body';
  token_name?: string;  // Authorization, X-API-Key, etc.

  // OAuth2 specifics
  oauth2_flow?: 'authorization_code' | 'implicit' | 'client_credentials' | 'password';
  oauth2_scopes?: string[];

  // Required roles/permissions
  required_roles?: string[];
  required_permissions?: string[];

  // Custom policy
  policy_name?: string;
  policy_expression?: string;
}
```

**R2.2: Guard/Middleware Node Type**

```typescript
interface GuardNode {
  type: 'Guard';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Guard type
  guard_type: 'auth' | 'role' | 'permission' | 'ownership' | 'rate_limit' | 'custom';

  // Implementation
  canActivate_logic?: string;  // Brief description
  dependencies: string[];  // Services injected

  // Applied to
  applied_to: Array<{
    type: 'controller' | 'method' | 'global';
    target: string;
  }>;
}
```

### R3: Error Handling Nodes

**R3.1: ErrorResponse Node Type**

```typescript
interface ErrorResponseNode {
  type: 'ErrorResponse';
  name: string;
  file: string;
  line: number;

  // HTTP mapping
  status_code: number;
  status_text: string;  // Bad Request, Not Found, etc.

  // Error structure
  error_schema: {
    code_field?: string;       // error.code
    message_field?: string;    // error.message
    details_field?: string;    // error.details
    timestamp_field?: string;
    trace_id_field?: string;
  };

  // Exception mapping
  from_exceptions: Array<{
    exception_class: string;
    message_template?: string;
  }>;

  // Documentation
  description?: string;
  example?: Record<string, unknown>;
}
```

**R3.2: ExceptionFilter Node Type**

```typescript
interface ExceptionFilterNode {
  type: 'ExceptionFilter';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Catches
  catches_exceptions: string[];  // Exception classes

  // Produces
  produces_response: {
    status_code: number;
    body_schema: string;
  };

  // Scope
  scope: 'global' | 'controller' | 'method';
  applied_to?: string[];
}
```

### R4: Rate Limiting Nodes

**R4.1: RateLimitConfig Node Type**

```typescript
interface RateLimitConfigNode {
  type: 'RateLimitConfig';
  name: string;
  file: string;
  line: number;

  // Limit configuration
  limit: number;
  window_seconds: number;
  window_type: 'fixed' | 'sliding';

  // Key generation
  key_by: 'ip' | 'user' | 'api_key' | 'custom';
  custom_key_expression?: string;

  // Response on limit
  limit_exceeded_status: number;  // Usually 429
  limit_exceeded_message?: string;

  // Headers
  include_headers: boolean;
  headers?: {
    limit_header: string;      // X-RateLimit-Limit
    remaining_header: string;  // X-RateLimit-Remaining
    reset_header: string;      // X-RateLimit-Reset
  };

  // Scope
  applied_to: Array<{
    type: 'global' | 'controller' | 'method';
    target: string;
  }>;
}
```

### R5: External API Integration Nodes

**R5.1: ExternalAPIClient Node Type**

```typescript
interface ExternalAPIClientNode {
  type: 'ExternalAPIClient';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Service info
  service_name: string;  // Stripe, Twilio, AWS, etc.
  base_url?: string;
  api_version?: string;

  // Authentication
  auth_type: 'api_key' | 'oauth2' | 'basic' | 'aws_sig_v4' | 'custom';
  auth_config_location?: string;  // Where creds come from

  // Endpoints called
  endpoints_used: Array<{
    method: string;
    path: string;
    purpose: string;
    called_from: string[];  // Internal methods that call this
  }>;

  // Error handling
  error_handling: {
    retry_policy?: {
      max_retries: number;
      backoff: 'fixed' | 'exponential';
    };
    circuit_breaker?: boolean;
    timeout_ms?: number;
  };

  // SDK or raw HTTP
  integration_type: 'sdk' | 'http_client';
  sdk_package?: string;  // @stripe/stripe-js
}
```

**R5.2: ExternalAPICall Node Type**

```typescript
interface ExternalAPICallNode {
  type: 'ExternalAPICall';
  client: string;  // Reference to ExternalAPIClient
  method: string;
  path: string;
  file: string;
  line: number;

  // Request
  request_params?: Record<string, string>;
  request_body_type?: string;

  // Response
  response_type?: string;

  // Called by
  calling_function: string;
  calling_file: string;
}
```

---

## Part 2: Graph Schema - API Edges

### R6: Relationship Types

**R6.1: ACCEPTS Edge**

```typescript
interface AcceptsEdge {
  type: 'ACCEPTS';
  from: APIEndpointNode;
  to: RequestSchemaNode;

  content_type: string;
}
```

**R6.2: RETURNS Edge**

```typescript
interface ReturnsEdge {
  type: 'RETURNS';
  from: APIEndpointNode;
  to: ResponseSchemaNode;

  status_code: number;
  content_type: string;
}
```

**R6.3: REQUIRES_AUTH Edge**

```typescript
interface RequiresAuthEdge {
  type: 'REQUIRES_AUTH';
  from: APIEndpointNode;
  to: AuthRequirementNode;

  is_optional: boolean;  // Some endpoints allow anonymous + auth
}
```

**R6.4: PROTECTED_BY Edge**

```typescript
interface ProtectedByEdge {
  type: 'PROTECTED_BY';
  from: APIEndpointNode;
  to: GuardNode;

  order: number;  // Guard execution order
}
```

**R6.5: RATE_LIMITED_BY Edge**

```typescript
interface RateLimitedByEdge {
  type: 'RATE_LIMITED_BY';
  from: APIEndpointNode;
  to: RateLimitConfigNode;
}
```

**R6.6: CALLS_EXTERNAL Edge**

```typescript
interface CallsExternalEdge {
  type: 'CALLS_EXTERNAL';
  from: FunctionNode;
  to: ExternalAPICallNode;

  is_critical: boolean;  // Failure blocks response
}
```

**R6.7: THROWS_ERROR Edge**

```typescript
interface ThrowsErrorEdge {
  type: 'THROWS_ERROR';
  from: APIEndpointNode | FunctionNode;
  to: ErrorResponseNode;

  condition?: string;
}
```

---

## Part 3: Framework-Specific Extractors

### R7: NestJS Extractor

**R7.1: Controller & Route Detection**

```typescript
const nestjsPatterns = {
  // Controller
  controller: /@Controller\(\s*['"]?([^'")\s]*)['"]?\s*\)/,

  // HTTP methods
  get: /@Get\(\s*['"]?([^'")\s]*)['"]?\s*\)/,
  post: /@Post\(\s*['"]?([^'")\s]*)['"]?\s*\)/,
  put: /@Put\(\s*['"]?([^'")\s]*)['"]?\s*\)/,
  patch: /@Patch\(\s*['"]?([^'")\s]*)['"]?\s*\)/,
  delete: /@Delete\(\s*['"]?([^'")\s]*)['"]?\s*\)/,

  // Parameters
  param: /@Param\(\s*['"]?(\w*)['"]?\s*\)/,
  query: /@Query\(\s*['"]?(\w*)['"]?\s*\)/,
  body: /@Body\(\s*\)/,
  headers: /@Headers\(\s*['"]?(\w*)['"]?\s*\)/,

  // Guards & Auth
  useGuards: /@UseGuards\(\s*([^)]+)\s*\)/,
  roles: /@Roles\(\s*([^)]+)\s*\)/,

  // Validation
  usePipes: /@UsePipes\(\s*([^)]+)\s*\)/,

  // Swagger/OpenAPI
  apiTags: /@ApiTags\(\s*([^)]+)\s*\)/,
  apiOperation: /@ApiOperation\(\s*\{([^}]+)\}\s*\)/,
  apiResponse: /@ApiResponse\(\s*\{([^}]+)\}\s*\)/,
  apiBody: /@ApiBody\(\s*\{([^}]+)\}\s*\)/,

  // Rate limiting
  throttle: /@Throttle\(\s*(\d+)\s*,\s*(\d+)\s*\)/,
};
```

**R7.2: DTO Validation Extraction**

```typescript
const dtoValidationPatterns = {
  // class-validator decorators
  isString: /@IsString\(\)/,
  isNumber: /@IsNumber\(\)/,
  isEmail: /@IsEmail\(\)/,
  isOptional: /@IsOptional\(\)/,
  isNotEmpty: /@IsNotEmpty\(\)/,
  minLength: /@MinLength\(\s*(\d+)\s*\)/,
  maxLength: /@MaxLength\(\s*(\d+)\s*\)/,
  min: /@Min\(\s*(\d+)\s*\)/,
  max: /@Max\(\s*(\d+)\s*\)/,
  matches: /@Matches\(\s*\/([^/]+)\/\s*\)/,
  isEnum: /@IsEnum\(\s*(\w+)\s*\)/,
  isArray: /@IsArray\(\)/,
  arrayMinSize: /@ArrayMinSize\(\s*(\d+)\s*\)/,
  arrayMaxSize: /@ArrayMaxSize\(\s*(\d+)\s*\)/,
  validNested: /@ValidateNested\(\)/,
  type: /@Type\(\s*\(\)\s*=>\s*(\w+)\s*\)/,

  // class-transformer
  exclude: /@Exclude\(\)/,
  expose: /@Expose\(\)/,
  transform: /@Transform\(\s*([^)]+)\s*\)/,
};
```

### R8: FastAPI Extractor

**R8.1: Route Detection**

```python
fastapi_patterns = {
    # Route decorators
    'get': r'@(?:app|router)\.get\s*\(\s*[\'"]([^\'"]+)[\'"]',
    'post': r'@(?:app|router)\.post\s*\(\s*[\'"]([^\'"]+)[\'"]',
    'put': r'@(?:app|router)\.put\s*\(\s*[\'"]([^\'"]+)[\'"]',
    'patch': r'@(?:app|router)\.patch\s*\(\s*[\'"]([^\'"]+)[\'"]',
    'delete': r'@(?:app|router)\.delete\s*\(\s*[\'"]([^\'"]+)[\'"]',

    # Parameters
    'path_param': r'(\w+)\s*:\s*(\w+)\s*=\s*Path\s*\(',
    'query_param': r'(\w+)\s*:\s*(?:Optional\[)?(\w+)(?:\])?\s*=\s*Query\s*\(',
    'body_param': r'(\w+)\s*:\s*(\w+)\s*(?:=\s*Body\s*\()?',
    'header_param': r'(\w+)\s*:\s*str\s*=\s*Header\s*\(',

    # Response model
    'response_model': r'response_model\s*=\s*(\w+)',

    # Status code
    'status_code': r'status_code\s*=\s*(\d+)',

    # Dependencies (auth, etc.)
    'depends': r'Depends\s*\(\s*(\w+)\s*\)',

    # Tags
    'tags': r'tags\s*=\s*\[([^\]]+)\]',
}
```

**R8.2: Pydantic Model Extraction**

```python
pydantic_patterns = {
    # Model definition
    'model': r'class\s+(\w+)\s*\(\s*(?:BaseModel|BaseSettings)\s*\)',

    # Field definitions
    'field': r'(\w+)\s*:\s*([^=\n]+?)(?:\s*=\s*(.+))?$',

    # Field constraints
    'field_func': r'Field\s*\(([^)]+)\)',

    # Validators
    'validator': r'@validator\s*\(\s*[\'"](\w+)[\'"]',
    'root_validator': r'@root_validator',

    # Config
    'config': r'class\s+Config\s*:([^}]+?)(?=\n\s*\n|\n\s*@|\Z)',
}
```

### R9: Express/Koa Extractor

**R9.1: Route Detection**

```typescript
const expressPatterns = {
  // Route definitions
  route: /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g,

  // Route with middleware
  routeWithMiddleware: /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"],\s*([^,)]+(?:,\s*[^,)]+)*),\s*(?:async\s+)?\(?/g,

  // Parameter extraction
  reqParams: /req\.params\.(\w+)/g,
  reqQuery: /req\.query\.(\w+)/g,
  reqBody: /req\.body\.(\w+)/g,

  // Response
  resStatus: /res\.status\(\s*(\d+)\s*\)/g,
  resJson: /res\.json\(\s*\{?/g,

  // Middleware
  useMiddleware: /(?:app|router)\.use\(\s*([^)]+)\s*\)/g,
};
```

### R10: Django REST Framework Extractor

**R10.1: ViewSet Detection**

```python
drf_patterns = {
    # ViewSet
    'viewset': r'class\s+(\w+)\s*\(\s*(?:viewsets\.)?(\w+ViewSet)\s*\)',

    # APIView
    'apiview': r'class\s+(\w+)\s*\(\s*(?:APIView|GenericAPIView)\s*\)',

    # Router registration
    'router': r'router\.register\s*\(\s*[\'"]([^\'"]+)[\'"]\s*,\s*(\w+)',

    # Serializer
    'serializer_class': r'serializer_class\s*=\s*(\w+)',

    # Permissions
    'permission_classes': r'permission_classes\s*=\s*\[([^\]]+)\]',

    # Authentication
    'authentication_classes': r'authentication_classes\s*=\s*\[([^\]]+)\]',

    # Throttling
    'throttle_classes': r'throttle_classes\s*=\s*\[([^\]]+)\]',

    # Actions
    'action': r'@action\s*\(([^)]+)\)',
}
```

---

## Part 4: OpenAPI/Swagger Integration

### R11: OpenAPI Spec Parsing

**R11.1: OpenAPI Document Extraction**

```typescript
interface OpenAPIExtraction {
  // Metadata
  title: string;
  version: string;
  description?: string;
  servers: Array<{ url: string; description?: string }>;

  // Paths
  paths: Record<string, Record<string, {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: Array<{
      name: string;
      in: 'path' | 'query' | 'header' | 'cookie';
      required: boolean;
      schema: JSONSchema;
    }>;
    requestBody?: {
      required: boolean;
      content: Record<string, { schema: JSONSchema }>;
    };
    responses: Record<string, {
      description: string;
      content?: Record<string, { schema: JSONSchema }>;
    }>;
    security?: Array<Record<string, string[]>>;
  }>>;

  // Components
  schemas: Record<string, JSONSchema>;
  securitySchemes: Record<string, SecurityScheme>;
}
```

**R11.2: Sync OpenAPI with Code**

```typescript
// Detect drift between OpenAPI spec and code
interface APIDrift {
  endpoint: string;
  method: string;
  drifts: Array<{
    type: 'missing_in_spec' | 'missing_in_code' | 'schema_mismatch' | 'auth_mismatch';
    field?: string;
    spec_value?: string;
    code_value?: string;
  }>;
}
```

---

## Part 5: External API Detection

### R12: SDK Pattern Detection

**R12.1: Common SDK Patterns**

```typescript
const sdkPatterns = {
  // Stripe
  stripe: {
    import: /import\s+Stripe\s+from\s+['"]stripe['"]/,
    client: /new\s+Stripe\s*\(/,
    calls: /stripe\.\w+\.(?:create|retrieve|update|del|list)\s*\(/g,
  },

  // AWS SDK
  aws: {
    import: /import\s+\{([^}]+)\}\s+from\s+['"]@aws-sdk\/client-(\w+)['"]/,
    client: /new\s+(\w+)Client\s*\(/,
    calls: /\.send\s*\(\s*new\s+(\w+)Command/g,
  },

  // Twilio
  twilio: {
    import: /import\s+(?:twilio|Twilio)\s+from\s+['"]twilio['"]/,
    client: /twilio\s*\(|new\s+Twilio\s*\(/,
    calls: /client\.\w+\.create\s*\(/g,
  },

  // SendGrid
  sendgrid: {
    import: /import\s+.*from\s+['"]@sendgrid\/mail['"]/,
    calls: /sgMail\.send\s*\(/g,
  },

  // Generic HTTP clients
  axios: {
    import: /import\s+axios\s+from\s+['"]axios['"]/,
    calls: /axios\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g,
  },

  fetch: {
    calls: /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
  },
};
```

---

## Part 6: Use Cases

### R13: Query Examples

**R13.1: API Discovery**

```cypher
// Get all endpoints with their auth requirements
MATCH (e:APIEndpoint)-[:REQUIRES_AUTH]->(a:AuthRequirement)
RETURN e.method, e.path, a.auth_type, a.required_roles

// Find endpoints without authentication
MATCH (e:APIEndpoint)
WHERE NOT (e)-[:REQUIRES_AUTH]->()
RETURN e.method, e.path, e.file

// Get request/response schemas for an endpoint
MATCH (e:APIEndpoint {path: '/orders'})-[:ACCEPTS]->(req:RequestSchema)
MATCH (e)-[:RETURNS]->(res:ResponseSchema)
RETURN req.fields, res.fields
```

**R13.2: Security Analysis**

```cypher
// Find admin-only endpoints
MATCH (e:APIEndpoint)-[:REQUIRES_AUTH]->(a:AuthRequirement)
WHERE 'admin' IN a.required_roles
RETURN e.method, e.path

// Endpoints with rate limiting
MATCH (e:APIEndpoint)-[:RATE_LIMITED_BY]->(r:RateLimitConfig)
RETURN e.path, r.limit, r.window_seconds

// Find unprotected write endpoints
MATCH (e:APIEndpoint)
WHERE e.method IN ['POST', 'PUT', 'PATCH', 'DELETE']
AND NOT (e)-[:REQUIRES_AUTH]->()
RETURN e.method, e.path, e.file
```

**R13.3: External Dependencies**

```cypher
// What external APIs do we depend on?
MATCH (c:ExternalAPIClient)
RETURN c.service_name, c.base_url, size(c.endpoints_used) as endpoints_count

// Find all Stripe API calls
MATCH (c:ExternalAPIClient {service_name: 'Stripe'})<-[:USES_CLIENT]-(f:Function)
RETURN f.name, f.file

// External calls in critical path
MATCH (e:APIEndpoint)-[:CALLS*]->(ext:ExternalAPICall)
RETURN e.path, ext.client, ext.method, ext.path
```

---

## Part 7: API Versioning Analysis

### R14: Version Detection

**R14.1: Versioning Strategies**

```typescript
type VersioningStrategy =
  | 'uri_path'      // /api/v1/users
  | 'header'        // Accept-Version: v1
  | 'query_param'   // /api/users?version=1
  | 'media_type'    // Accept: application/vnd.api.v1+json
  | 'none';

interface APIVersionInfo {
  strategy: VersioningStrategy;
  versions_found: string[];
  endpoints_by_version: Record<string, string[]>;
  breaking_changes: Array<{
    from_version: string;
    to_version: string;
    endpoint: string;
    change_type: 'removed' | 'renamed' | 'schema_changed' | 'auth_changed';
    description: string;
  }>;
}
```

**R14.2: Version Extraction Patterns**

```typescript
const versioningPatterns = {
  // URI path versioning
  uriPath: /\/(?:api\/)?v(\d+)/i,

  // Controller versioning (NestJS)
  controllerVersion: /@Controller\(\s*\{[^}]*version:\s*['"](\d+)['"]/,

  // Route prefix
  routePrefix: /prefix:\s*['"]\/v(\d+)/,

  // OpenAPI version tag
  openapiVersion: /version:\s*['"](\d+\.\d+\.\d+)['"]/,
};
```

---

## Part 8: Integration

### R15: Mesh Builder Integration

**R15.1: Schema Files**

```
schemas/api/
├── nestjs-api.json
├── fastapi-api.json
├── express-api.json
├── django-drf-api.json
├── openapi.json
└── external-clients.json
```

**R15.2: Extractor Classes**

```typescript
// src/mesh-builder/src/extractors/api/
export class NestJSAPIExtractor extends BaseAPIExtractor { ... }
export class FastAPIExtractor extends BaseAPIExtractor { ... }
export class ExpressAPIExtractor extends BaseAPIExtractor { ... }
export class DjangoRESTExtractor extends BaseAPIExtractor { ... }
export class OpenAPIExtractor extends BaseAPIExtractor { ... }
export class ExternalClientExtractor extends BaseAPIExtractor { ... }
```

**R15.3: OpenAPI Generator**

```typescript
// Generate OpenAPI spec from extracted graph
export class OpenAPIGenerator {
  generateSpec(endpoints: APIEndpointNode[]): OpenAPIDocument;
  detectDrift(spec: OpenAPIDocument, code: APIEndpointNode[]): APIDrift[];
}
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| NestJS endpoint detection | > 98% |
| FastAPI endpoint detection | > 98% |
| Express route detection | > 95% |
| Request schema extraction | > 95% |
| Auth requirement detection | > 90% |
| External API client detection | > 85% |
| Rate limit detection | > 90% |
| OpenAPI sync accuracy | > 95% |
| Extraction time (100 endpoints) | < 10s |

---

## Implementation Phases

### Phase 1: Core Endpoint Extraction (P1)
- NestJS controller/route parsing
- FastAPI route parsing
- Express/Koa route detection
- Basic path parameter extraction

### Phase 2: Request/Response Schemas (P1)
- DTO validation extraction
- Pydantic model parsing
- Response type detection
- OpenAPI schema parsing

### Phase 3: Auth & Security (P1)
- Guard/middleware detection
- Role/permission extraction
- Rate limit configuration
- Error response mapping

### Phase 4: External Integrations (P2)
- SDK client detection
- HTTP client call tracing
- External API dependency graph

### Phase 5: Documentation Sync (P2)
- OpenAPI spec parsing
- Code-spec drift detection
- Auto-documentation generation

---

## Open Questions

1. **GraphQL**: Should GraphQL schema extraction be part of this or separate?
2. **gRPC/Protobuf**: How to handle gRPC service definitions?
3. **WebSocket**: Should we extract WebSocket endpoints and message schemas?
4. **Versioning Strategy**: How to handle mixed versioning strategies?

---

## References

- OpenAPI Specification: https://swagger.io/specification/
- NestJS Documentation: https://docs.nestjs.com/
- FastAPI Documentation: https://fastapi.tiangolo.com/
- Django REST Framework: https://www.django-rest-framework.org/
