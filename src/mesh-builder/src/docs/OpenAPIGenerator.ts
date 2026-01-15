/**
 * OpenAPIGenerator - Generate OpenAPI 3.0 specifications from mesh data.
 *
 * Creates valid OpenAPI specs that can be used with Swagger UI,
 * API documentation tools, or code generators.
 */

import { DocQueryBuilder, ApiDocData } from './DocQueryBuilder';
import { ProjectExtractionResult } from '../types';

export interface OpenAPIConfig {
  /** API title */
  title: string;
  /** API version */
  version: string;
  /** API description */
  description?: string;
  /** Server URLs */
  servers?: Array<{ url: string; description?: string }>;
  /** Contact information */
  contact?: {
    name?: string;
    email?: string;
    url?: string;
  };
  /** License */
  license?: {
    name: string;
    url?: string;
  };
}

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
    contact?: OpenAPIConfig['contact'];
    license?: OpenAPIConfig['license'];
  };
  servers?: OpenAPIConfig['servers'];
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    parameters?: Record<string, ParameterObject>;
    responses?: Record<string, ResponseObject>;
  };
  tags?: Array<{ name: string; description?: string }>;
}

interface PathItem {
  [method: string]: OperationObject;
}

interface OperationObject {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses: Record<string, ResponseObject>;
}

interface ParameterObject {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
}

interface RequestBodyObject {
  description?: string;
  required?: boolean;
  content: Record<string, MediaTypeObject>;
}

interface MediaTypeObject {
  schema?: SchemaObject;
}

interface ResponseObject {
  description: string;
  content?: Record<string, MediaTypeObject>;
}

interface SchemaObject {
  type?: string;
  format?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  $ref?: string;
}

const DEFAULT_CONFIG: OpenAPIConfig = {
  title: 'API Documentation',
  version: '1.0.0',
  description: 'Auto-generated from code knowledge mesh',
};

export class OpenAPIGenerator {
  private config: OpenAPIConfig;
  private queryBuilder: DocQueryBuilder;

  constructor(
    extractionResult: ProjectExtractionResult,
    config: Partial<OpenAPIConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queryBuilder = new DocQueryBuilder(extractionResult);
  }

  /**
   * Generate complete OpenAPI specification.
   */
  generate(): OpenAPISpec {
    const endpoints = this.queryBuilder.getApiEndpoints();

    // Group endpoints by tag (file/directory)
    const pathsByTag = this.groupByTag(endpoints);
    const paths = this.buildPaths(endpoints);
    const tags = this.buildTags(pathsByTag);

    return {
      openapi: '3.0.3',
      info: {
        title: this.config.title,
        version: this.config.version,
        description: this.config.description,
        contact: this.config.contact,
        license: this.config.license,
      },
      servers: this.config.servers,
      paths,
      tags,
      components: {
        schemas: {},
        parameters: {},
        responses: this.buildCommonResponses(),
      },
    };
  }

  /**
   * Generate OpenAPI spec as JSON string.
   */
  generateJSON(pretty: boolean = true): string {
    const spec = this.generate();
    return JSON.stringify(spec, null, pretty ? 2 : 0);
  }

  /**
   * Generate OpenAPI spec as YAML string.
   */
  generateYAML(): string {
    const spec = this.generate();
    return this.toYAML(spec);
  }

  /**
   * Group endpoints by tag (derived from file path).
   */
  private groupByTag(endpoints: ApiDocData[]): Map<string, ApiDocData[]> {
    const groups = new Map<string, ApiDocData[]>();

    for (const endpoint of endpoints) {
      const tag = this.extractTag(endpoint);
      const existing = groups.get(tag) || [];
      existing.push(endpoint);
      groups.set(tag, existing);
    }

    return groups;
  }

  /**
   * Extract tag name from endpoint.
   */
  private extractTag(endpoint: ApiDocData): string {
    // Use path prefix as tag
    const pathParts = endpoint.path.split('/').filter(Boolean);
    if (pathParts.length > 0 && !pathParts[0]?.startsWith('{')) {
      return pathParts[0] ?? 'default';
    }

    // Fall back to file directory
    const fileParts = endpoint.file.split('/');
    return fileParts[fileParts.length - 2] || 'default';
  }

  /**
   * Build paths object.
   */
  private buildPaths(endpoints: ApiDocData[]): Record<string, PathItem> {
    const paths: Record<string, PathItem> = {};

    for (const endpoint of endpoints) {
      const pathKey = this.normalizePathForOpenAPI(endpoint.path);

      if (!paths[pathKey]) {
        paths[pathKey] = {};
      }

      const method = endpoint.method.toLowerCase();
      paths[pathKey]![method] = this.buildOperation(endpoint);
    }

    return paths;
  }

  /**
   * Normalize path for OpenAPI (convert :param to {param}).
   */
  private normalizePathForOpenAPI(path: string): string {
    // Convert :param to {param}
    return path.replace(/:(\w+)/g, '{$1}');
  }

  /**
   * Build operation object for an endpoint.
   */
  private buildOperation(endpoint: ApiDocData): OperationObject {
    const operation: OperationObject = {
      summary: endpoint.description || `${endpoint.method} ${endpoint.path}`,
      operationId: this.generateOperationId(endpoint),
      tags: [this.extractTag(endpoint)],
      parameters: this.buildParameters(endpoint),
      responses: this.buildResponses(endpoint),
    };

    // Add request body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      const bodyParams = endpoint.parameters.filter((p) => p.location === 'body');
      if (bodyParams.length > 0) {
        operation.requestBody = this.buildRequestBody(bodyParams);
      }
    }

    return operation;
  }

  /**
   * Generate unique operation ID.
   */
  private generateOperationId(endpoint: ApiDocData): string {
    const pathParts = endpoint.path
      .replace(/[{}:]/g, '')
      .split('/')
      .filter(Boolean);

    const method = endpoint.method.toLowerCase();
    const pathName = pathParts.join('_') || 'root';

    return `${method}_${pathName}`;
  }

  /**
   * Build parameters array.
   */
  private buildParameters(endpoint: ApiDocData): ParameterObject[] {
    return endpoint.parameters
      .filter((p) => p.location !== 'body')
      .map((p) => ({
        name: p.name,
        in: p.location as 'path' | 'query' | 'header',
        required: p.required,
        description: p.description,
        schema: {
          type: this.mapTypeToOpenAPI(p.type),
        },
      }));
  }

  /**
   * Build request body object.
   */
  private buildRequestBody(bodyParams: ApiDocData['parameters']): RequestBodyObject {
    const properties: Record<string, SchemaObject> = {};

    for (const param of bodyParams) {
      properties[param.name] = {
        type: this.mapTypeToOpenAPI(param.type),
      };
    }

    return {
      required: bodyParams.some((p) => p.required),
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties,
          },
        },
      },
    };
  }

  /**
   * Build responses object.
   */
  private buildResponses(endpoint: ApiDocData): Record<string, ResponseObject> {
    const responses: Record<string, ResponseObject> = {};

    for (const response of endpoint.responses) {
      responses[String(response.status)] = {
        description: response.description || this.getStatusDescription(response.status),
        content: response.schema
          ? {
              'application/json': {
                schema: {
                  $ref: `#/components/schemas/${response.schema}`,
                },
              },
            }
          : undefined,
      };
    }

    return responses;
  }

  /**
   * Build common response definitions.
   */
  private buildCommonResponses(): Record<string, ResponseObject> {
    return {
      BadRequest: { description: 'Bad Request' },
      Unauthorized: { description: 'Unauthorized' },
      Forbidden: { description: 'Forbidden' },
      NotFound: { description: 'Not Found' },
      InternalError: { description: 'Internal Server Error' },
    };
  }

  /**
   * Build tags array.
   */
  private buildTags(
    pathsByTag: Map<string, ApiDocData[]>
  ): Array<{ name: string; description?: string }> {
    return Array.from(pathsByTag.keys())
      .sort()
      .map((name) => ({
        name,
        description: `${name} related endpoints`,
      }));
  }

  /**
   * Map type string to OpenAPI type.
   */
  private mapTypeToOpenAPI(type: string): string {
    const typeMap: Record<string, string> = {
      string: 'string',
      str: 'string',
      int: 'integer',
      integer: 'integer',
      float: 'number',
      number: 'number',
      bool: 'boolean',
      boolean: 'boolean',
      array: 'array',
      list: 'array',
      object: 'object',
      dict: 'object',
    };

    return typeMap[type.toLowerCase()] || 'string';
  }

  /**
   * Get default description for HTTP status code.
   */
  private getStatusDescription(status: number): string {
    const descriptions: Record<number, string> = {
      200: 'Successful response',
      201: 'Created',
      204: 'No content',
      400: 'Bad request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not found',
      422: 'Validation error',
      500: 'Internal server error',
    };

    return descriptions[status] || 'Response';
  }

  /**
   * Convert object to YAML string.
   */
  private toYAML(obj: unknown, indent: number = 0): string {
    if (obj === null || obj === undefined) {
      return 'null';
    }

    if (typeof obj === 'string') {
      if (obj.includes('\n') || obj.includes(':') || obj.includes('#')) {
        return `"${obj.replace(/"/g, '\\"')}"`;
      }
      return obj;
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return String(obj);
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      const items = obj.map(
        (item) => `${'  '.repeat(indent)}- ${this.toYAML(item, indent + 1)}`
      );
      return '\n' + items.join('\n');
    }

    if (typeof obj === 'object') {
      const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
      if (entries.length === 0) return '{}';

      const lines = entries.map(([key, value]) => {
        const valueStr = this.toYAML(value, indent + 1);
        if (valueStr.startsWith('\n')) {
          return `${'  '.repeat(indent)}${key}:${valueStr}`;
        }
        return `${'  '.repeat(indent)}${key}: ${valueStr}`;
      });

      return (indent > 0 ? '\n' : '') + lines.join('\n');
    }

    return String(obj);
  }
}
