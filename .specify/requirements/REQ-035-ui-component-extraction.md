# REQ-035: UI Component Extraction

**Status:** Draft
**Priority:** P0
**Created:** 2026-01-15
**Author:** Doug / Claude
**Depends On:** REQ-033 (Code Knowledge Mesh), REQ-034 (Extraction Context Provider)
**Layer:** L3 (draagon-forge) - Programming-specific

---

## Summary

Extract semantic knowledge from frontend UI frameworks (React, Vue, Angular, Svelte) including component hierarchies, state management patterns, event handlers, props/inputs, hooks, and routing. Enable the Code Knowledge Mesh to understand not just "what components exist" but "how the UI is structured, what state flows through it, and how users interact with it."

**Key Capabilities:**
- **Component Tree Extraction**: Parent-child rendering relationships across files
- **State Flow Analysis**: useState, Redux, Vuex, Zustand, signals tracking
- **Event Handler Mapping**: User interactions → handler functions → side effects
- **Props/Input Typing**: Component interfaces and their constraints
- **Hook Dependency Graphs**: Custom hooks and their composition
- **Route-to-Component Mapping**: URL patterns → page components

---

## Problem Statement

### Why UI Extraction Matters

Frontend code represents 40-60% of most web applications, yet current extraction focuses on backend patterns. UI code has unique semantics:

```typescript
// What structural extraction sees:
// - Function: UserCard
// - Import: react
// - Variable: user

// What we NEED to understand:
// - This is a React functional component
// - It receives props: { user: User, onDelete: (id) => void }
// - It renders conditionally based on user.isActive
// - onClick triggers onDelete callback (event flow)
// - It's rendered by UserList in a .map() loop
// - It uses useAuth() hook for permission checks
```

### The Component Hierarchy Problem

Modern UIs are composed of deeply nested components:

```
App
├── Layout
│   ├── Header
│   │   ├── Logo
│   │   ├── Navigation
│   │   │   └── NavItem (×5)
│   │   └── UserMenu
│   │       └── Avatar
│   ├── Sidebar
│   │   └── SidebarItem (×10)
│   └── MainContent
│       └── {children} ← Router outlet
└── Footer
```

**Questions we can't answer today:**
- What components render `<UserCard>`?
- What props does `<Dashboard>` pass down through 3 levels?
- If I change `User` type, which components break?
- What's the full render tree for `/settings` route?

### Framework Diversity

| Framework | Component Style | State Pattern | Challenge |
|-----------|-----------------|---------------|-----------|
| React | Functions + Hooks | useState, useReducer, Context | Hook composition |
| Vue 3 | SFC with `<script setup>` | ref, reactive, Pinia | Template syntax |
| Angular | Classes + Decorators | Services, RxJS, NgRx | DI + Observables |
| Svelte | Compiled components | $: reactive, stores | Compile-time magic |
| Solid | Functions + Signals | createSignal, stores | Fine-grained reactivity |

Each requires framework-aware extraction.

---

## Solution Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         UI COMPONENT EXTRACTION                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    FRAMEWORK DETECTION (from REQ-034)                    │   │
│  │   React (hooks, JSX) | Vue (SFC, Composition) | Angular (decorators)    │   │
│  └──────────────────────────────────┬──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │              FRAMEWORK-SPECIFIC EXTRACTORS                               │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │   │
│  │  │   React     │ │    Vue      │ │  Angular    │ │     Svelte      │   │   │
│  │  │  Extractor  │ │  Extractor  │ │  Extractor  │ │    Extractor    │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘   │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                    UNIFIED UI GRAPH NODES                                │   │
│  │  Component | Hook | State | Event | Route | Prop | Slot | Directive     │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                    RELATIONSHIP EDGES                                    │   │
│  │  RENDERS | PASSES_PROP | HANDLES_EVENT | USES_HOOK | ROUTES_TO          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Graph Schema - UI Nodes

### R1: Component Nodes

**R1.1: Component Node Type**

```typescript
interface ComponentNode {
  type: 'Component';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Framework-specific
  framework: 'react' | 'vue' | 'angular' | 'svelte' | 'solid';
  component_type: 'functional' | 'class' | 'sfc' | 'directive';

  // Props/Inputs
  props_interface?: string;  // Reference to Interface node
  props: Array<{
    name: string;
    type: string;
    required: boolean;
    default_value?: string;
  }>;

  // Outputs/Events
  emits?: string[];  // Vue/Angular
  callbacks?: Array<{  // React
    prop_name: string;
    signature: string;
  }>;

  // Slots/Children
  accepts_children: boolean;
  named_slots?: string[];  // Vue/Svelte

  // Metadata
  is_page: boolean;  // Route target
  is_layout: boolean;
  export_type: 'default' | 'named' | 'none';
}
```

**R1.2: Hook/Composable Node Type**

```typescript
interface HookNode {
  type: 'Hook';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  framework: 'react' | 'vue' | 'solid';
  hook_type: 'state' | 'effect' | 'memo' | 'ref' | 'context' | 'custom';

  // Dependencies
  dependencies: string[];  // Other hooks called

  // Return shape
  returns: Array<{
    name: string;
    type: string;
    is_setter?: boolean;
    is_ref?: boolean;
  }>;

  // Side effects
  has_side_effects: boolean;
  effect_dependencies?: string[];  // useEffect deps
}
```

**R1.3: State Node Type**

```typescript
interface UIStateNode {
  type: 'UIState';
  name: string;
  file: string;
  line: number;

  state_type: 'local' | 'context' | 'store' | 'url' | 'session';
  framework_pattern: 'useState' | 'useReducer' | 'ref' | 'reactive' |
                     'signal' | 'store' | 'observable';

  // Type info
  value_type: string;
  initial_value?: string;

  // Scope
  scope: 'component' | 'tree' | 'global';
  provider_component?: string;  // For context/store

  // Mutations
  setter_name?: string;
  reducer_actions?: string[];
}
```

**R1.4: Event Handler Node Type**

```typescript
interface EventHandlerNode {
  type: 'EventHandler';
  name: string;
  file: string;
  line: number;

  event_type: 'click' | 'change' | 'submit' | 'keydown' | 'custom' | string;
  handler_function: string;  // Reference to Function node

  // What it does
  mutations: string[];  // State it modifies
  api_calls: string[];  // External calls
  navigation?: string;  // Route changes

  // Binding
  element_type?: string;  // button, input, form
  is_inline: boolean;
}
```

**R1.5: Route Node Type**

```typescript
interface RouteNode {
  type: 'Route';
  path: string;
  file: string;
  line: number;

  // Component binding
  component: string;
  layout?: string;

  // Route config
  is_dynamic: boolean;
  params: Array<{ name: string; type: string }>;
  query_params?: Array<{ name: string; type: string }>;

  // Guards/Middleware
  guards: string[];
  loaders?: string[];  // Data loaders (Remix, Next)

  // Metadata
  is_protected: boolean;
  required_roles?: string[];
}
```

---

## Part 2: Graph Schema - UI Edges

### R2: Relationship Types

**R2.1: RENDERS Edge**

```typescript
// Component A renders Component B
interface RendersEdge {
  type: 'RENDERS';
  from: ComponentNode;
  to: ComponentNode;

  // Rendering context
  is_conditional: boolean;
  condition?: string;
  is_loop: boolean;
  loop_variable?: string;

  // Location
  jsx_line: number;
}
```

**R2.2: PASSES_PROP Edge**

```typescript
interface PassesPropEdge {
  type: 'PASSES_PROP';
  from: ComponentNode;
  to: ComponentNode;

  prop_name: string;
  value_source: 'literal' | 'state' | 'prop' | 'computed' | 'function';
  source_name?: string;  // Which state/prop

  // Spread handling
  is_spread: boolean;
}
```

**R2.3: USES_HOOK Edge**

```typescript
interface UsesHookEdge {
  type: 'USES_HOOK';
  from: ComponentNode | HookNode;
  to: HookNode;

  call_line: number;
  destructured_values: string[];
}
```

**R2.4: HANDLES_EVENT Edge**

```typescript
interface HandlesEventEdge {
  type: 'HANDLES_EVENT';
  from: ComponentNode;
  to: EventHandlerNode;

  event_name: string;
  element_selector?: string;  // Which element
}
```

**R2.5: ROUTES_TO Edge**

```typescript
interface RoutesToEdge {
  type: 'ROUTES_TO';
  from: RouteNode;
  to: ComponentNode;

  is_lazy: boolean;
  preload_strategy?: string;
}
```

**R2.6: PROVIDES_CONTEXT Edge**

```typescript
interface ProvidesContextEdge {
  type: 'PROVIDES_CONTEXT';
  from: ComponentNode;
  to: UIStateNode;

  context_name: string;
}
```

**R2.7: CONSUMES_CONTEXT Edge**

```typescript
interface ConsumesContextEdge {
  type: 'CONSUMES_CONTEXT';
  from: ComponentNode;
  to: UIStateNode;

  context_name: string;
  values_used: string[];
}
```

---

## Part 3: Framework-Specific Extractors

### R3: React Extractor

**R3.1: Functional Component Detection**

```typescript
// Patterns to detect
const patterns = {
  // Named function component
  namedFunctionComponent: /^(?:export\s+)?function\s+([A-Z]\w*)\s*\((?:\{\s*([^}]*)\}\s*)?(?::\s*([^)]+))?\)/gm,

  // Arrow function component
  arrowComponent: /^(?:export\s+)?const\s+([A-Z]\w*)\s*(?::\s*(?:React\.)?FC<([^>]+)>)?\s*=\s*(?:\((?:\{\s*([^}]*)\}\s*)?(?::\s*([^)]+))?\)|(\w+))\s*=>/gm,

  // forwardRef
  forwardRef: /forwardRef(?:<([^>]+)>)?\(\s*(?:\(([^)]+)\)|(\w+))\s*=>/gm,

  // memo
  memo: /memo\(\s*(?:function\s+)?([A-Z]\w*)/gm,
};
```

**R3.2: Hook Extraction**

```typescript
const hookPatterns = {
  // Built-in hooks
  useState: /const\s+\[(\w+),\s*(\w+)\]\s*=\s*useState(?:<([^>]+)>)?\(([^)]*)\)/g,
  useEffect: /useEffect\(\s*\(\)\s*=>\s*\{/g,
  useContext: /(?:const\s+)?(?:\{([^}]+)\}|(\w+))\s*=\s*useContext\((\w+)\)/g,
  useReducer: /const\s+\[(\w+),\s*(\w+)\]\s*=\s*useReducer\((\w+)/g,
  useMemo: /(?:const\s+)?(\w+)\s*=\s*useMemo\(/g,
  useCallback: /(?:const\s+)?(\w+)\s*=\s*useCallback\(/g,
  useRef: /(?:const\s+)?(\w+)\s*=\s*useRef(?:<([^>]+)>)?\(/g,

  // Custom hooks (use* pattern)
  customHook: /(?:const\s+)?(?:\{([^}]+)\}|(\w+))\s*=\s*(use[A-Z]\w*)\(/g,
};
```

**R3.3: JSX Child Component Extraction**

```typescript
// Extract rendered components from JSX
const jsxPatterns = {
  // <ComponentName prop={value} />
  selfClosing: /<([A-Z]\w*)(?:\s+([^>]*))?\s*\/>/g,

  // <ComponentName>{children}</ComponentName>
  withChildren: /<([A-Z]\w*)(?:\s+([^>]*))?>[\s\S]*?<\/\1>/g,

  // Conditional: {condition && <Component />}
  conditional: /\{([^}]+)\s*&&\s*<([A-Z]\w*)/g,

  // Ternary: {condition ? <A /> : <B />}
  ternary: /\{[^}]+\?\s*<([A-Z]\w*)[^:]+:\s*<([A-Z]\w*)/g,

  // Map: {items.map(x => <Component />)}
  mapped: /\.map\([^)]*=>\s*(?:\(?\s*)?<([A-Z]\w*)/g,
};
```

**R3.4: Props Extraction**

```typescript
interface ExtractedProps {
  component: string;
  props: Array<{
    name: string;
    type: string;
    required: boolean;
    default_value?: string;
  }>;
}

// From TypeScript interface
// From PropTypes (legacy)
// From destructuring pattern
// From FC<Props> generic
```

### R4: Vue Extractor

**R4.1: SFC Parsing**

```typescript
interface VueSFCExtraction {
  // <script setup> analysis
  script_setup: {
    imports: string[];
    props: Array<{ name: string; type: string; required: boolean; default?: string }>;
    emits: string[];
    refs: Array<{ name: string; type: string }>;
    computed: Array<{ name: string; dependencies: string[] }>;
    methods: string[];
    composables: Array<{ name: string; source: string }>;
  };

  // <template> analysis
  template: {
    child_components: Array<{ name: string; props: Record<string, string>; events: string[] }>;
    slots: Array<{ name: string; scope?: string }>;
    directives: Array<{ name: string; element: string; value: string }>;
  };

  // <style> analysis (optional)
  style: {
    scoped: boolean;
    preprocessor?: string;
  };
}
```

**R4.2: Composition API Patterns**

```typescript
const vuePatterns = {
  defineProps: /defineProps(?:<([^>]+)>)?\(\s*(?:\{([^}]+)\}|([^)]+))?\)/g,
  defineEmits: /defineEmits(?:<([^>]+)>)?\(\s*\[([^\]]+)\]\)/g,
  ref: /(?:const|let)\s+(\w+)\s*=\s*ref(?:<([^>]+)>)?\(([^)]*)\)/g,
  reactive: /(?:const|let)\s+(\w+)\s*=\s*reactive(?:<([^>]+)>)?\(/g,
  computed: /(?:const|let)\s+(\w+)\s*=\s*computed\(\s*\(\)\s*=>/g,
  watch: /watch\(\s*(?:\(\)\s*=>)?\s*(\w+)/g,
  composable: /(?:const|let)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*(use[A-Z]\w*)\(/g,
};
```

### R5: Angular Extractor

**R5.1: Decorator-Based Detection**

```typescript
const angularPatterns = {
  component: /@Component\(\s*\{([^}]+)\}\s*\)\s*(?:export\s+)?class\s+(\w+)/gs,
  directive: /@Directive\(\s*\{([^}]+)\}\s*\)\s*(?:export\s+)?class\s+(\w+)/gs,
  pipe: /@Pipe\(\s*\{([^}]+)\}\s*\)\s*(?:export\s+)?class\s+(\w+)/gs,

  // Inputs/Outputs
  input: /@Input\((?:'([^']+)')?\)\s*(\w+)(?:\s*[!?]?\s*:\s*([^;=]+))?/g,
  output: /@Output\((?:'([^']+)')?\)\s*(\w+)\s*=\s*new\s+EventEmitter<([^>]+)>/g,

  // Injection
  inject: /(?:private|public|protected)?\s*(?:readonly)?\s*(\w+)\s*:\s*(\w+)/g,
};
```

**R5.2: Template Syntax**

```typescript
// Angular template patterns
const templatePatterns = {
  // Component usage
  component: /<([a-z]+-[a-z-]+)(?:\s+([^>]*))?\s*(?:\/>|>)/g,  // kebab-case

  // Input binding: [prop]="value"
  inputBinding: /\[(\w+)\]="([^"]+)"/g,

  // Output binding: (event)="handler($event)"
  outputBinding: /\((\w+)\)="([^"]+)"/g,

  // Two-way: [(ngModel)]="value"
  twoWay: /\[\((\w+)\)\]="([^"]+)"/g,

  // Structural: *ngIf, *ngFor
  structural: /\*(\w+)="([^"]+)"/g,
};
```

### R6: Svelte Extractor

**R6.1: Svelte Syntax**

```typescript
const sveltePatterns = {
  // Props: export let name
  prop: /export\s+let\s+(\w+)(?:\s*:\s*([^=;]+))?(?:\s*=\s*([^;]+))?/g,

  // Reactive: $: derived = ...
  reactive: /\$:\s*(\w+)\s*=/g,

  // Store subscription: $storeName
  storeSubscription: /\$(\w+)/g,

  // Events: on:click={handler}
  event: /on:(\w+)(?:=\{([^}]+)\})?/g,

  // Slots
  slot: /<slot(?:\s+name="(\w+)")?/g,
};
```

---

## Part 4: State Management Extraction

### R7: Global State Stores

**R7.1: Redux/RTK**

```typescript
interface ReduxExtraction {
  // Slices
  slices: Array<{
    name: string;
    file: string;
    initial_state_type: string;
    reducers: Array<{ name: string; payload_type?: string }>;
    extra_reducers?: string[];  // Async thunks
  }>;

  // Selectors
  selectors: Array<{
    name: string;
    file: string;
    input_selectors: string[];
    return_type: string;
  }>;

  // Thunks
  thunks: Array<{
    name: string;
    file: string;
    arg_type?: string;
    return_type: string;
    api_calls: string[];
  }>;

  // Store configuration
  store: {
    file: string;
    middleware: string[];
    devtools: boolean;
  };
}
```

**R7.2: Zustand**

```typescript
const zustandPatterns = {
  // create((set, get) => ({ ... }))
  store: /(?:export\s+)?const\s+(\w+)\s*=\s*create(?:<([^>]+)>)?\(/g,

  // Actions in store
  action: /(\w+)\s*:\s*\([^)]*\)\s*=>\s*(?:set|get)\(/g,

  // Selectors
  selector: /(?:export\s+)?const\s+(\w+)\s*=\s*\(state\)\s*=>/g,
};
```

**R7.3: Pinia (Vue)**

```typescript
const piniaPatterns = {
  // defineStore('name', { ... })
  store: /defineStore\(\s*['"](\w+)['"]\s*,\s*\{/g,

  // Setup store: defineStore('name', () => { ... })
  setupStore: /defineStore\(\s*['"](\w+)['"]\s*,\s*\(\)\s*=>\s*\{/g,

  // State
  state: /state\s*:\s*\(\)\s*=>\s*\(?\s*\{([^}]+)\}/g,

  // Getters
  getter: /(\w+)\s*\(state\)\s*\{/g,

  // Actions
  action: /(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g,
};
```

---

## Part 5: Routing Extraction

### R8: Router Configuration

**R8.1: React Router**

```typescript
const reactRouterPatterns = {
  // <Route path="/users" element={<Users />} />
  routeElement: /<Route\s+path="([^"]+)"[^>]*element=\{<(\w+)/g,

  // createBrowserRouter([{ path, element }])
  routerConfig: /\{\s*path\s*:\s*['"]([^'"]+)['"][^}]*element\s*:\s*<(\w+)/g,

  // Nested routes
  nestedRoute: /<Route\s+path="([^"]+)"[^>]*>\s*<Route/g,

  // Lazy loading
  lazyRoute: /lazy\(\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/g,
};
```

**R8.2: Next.js App Router**

```typescript
// File-based routing extraction
interface NextAppRouterExtraction {
  routes: Array<{
    path: string;  // Derived from file path
    file: string;
    type: 'page' | 'layout' | 'loading' | 'error' | 'not-found';
    is_dynamic: boolean;
    params: string[];  // [id], [[...slug]]
    is_parallel: boolean;  // @modal
    is_intercepted: boolean;  // (.)
  }>;

  // Server vs Client
  component_boundary: 'server' | 'client';  // 'use client' directive

  // Data fetching
  data_fetching: {
    generateStaticParams?: boolean;
    generateMetadata?: boolean;
  };
}
```

**R8.3: Vue Router**

```typescript
const vueRouterPatterns = {
  // { path: '/users', component: Users }
  routeConfig: /\{\s*path\s*:\s*['"]([^'"]+)['"][^}]*component\s*:\s*(\w+)/g,

  // Lazy: () => import('./views/Users.vue')
  lazyComponent: /component\s*:\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/g,

  // Navigation guards
  beforeEnter: /beforeEnter\s*:\s*(?:\[([^\]]+)\]|(\w+))/g,
};
```

---

## Part 6: AI-Assisted Extraction

### R9: Tier 3 Discovery for UI

**R9.1: Component Relationship Discovery**

When static patterns fail, use AI to discover:

```xml
<prompt>
Analyze this React component file and extract:
1. Component hierarchy - what components does this render?
2. Props flow - what data is passed to child components?
3. Event flow - what callbacks are passed down and where do they originate?
4. State dependencies - what state/hooks affect the render?

File: {file_content}

Related types: {imported_types}

<output_format>
<component name="ComponentName">
  <renders>
    <child name="ChildComponent"
           conditional="true"
           condition="isLoading"
           props="user,onDelete" />
  </renders>
  <state_deps>
    <dep name="users" source="useState" />
    <dep name="isLoading" source="useQuery" />
  </state_deps>
</component>
</output_format>
</prompt>
```

**R9.2: State Flow Tracing**

```xml
<prompt>
Trace the state flow in this React application:

Entry component: {component_name}
State definition: {state_location}

Questions to answer:
1. Where is this state defined (component/context/store)?
2. What components consume this state?
3. What actions/events modify this state?
4. What's the data flow path from definition to usage?

Files to analyze:
{relevant_files}

<output_format>
<state_flow name="currentUser">
  <definition file="AuthContext.tsx" line="15" type="context" />
  <providers>
    <provider component="AuthProvider" file="AuthContext.tsx" />
  </providers>
  <consumers>
    <consumer component="Header" file="Header.tsx" usage="display" />
    <consumer component="ProtectedRoute" file="ProtectedRoute.tsx" usage="guard" />
  </consumers>
  <mutations>
    <mutation action="login" file="AuthContext.tsx" line="42" />
    <mutation action="logout" file="AuthContext.tsx" line="55" />
  </mutations>
</state_flow>
</output_format>
</prompt>
```

---

## Part 7: Use Cases

### R10: Query Examples

**R10.1: Component Impact Analysis**

```cypher
// What breaks if I change User interface?
MATCH (i:Interface {name: 'User'})<-[:USES_TYPE]-(c:Component)
RETURN c.name, c.file

// What components render UserCard?
MATCH (parent:Component)-[:RENDERS]->(child:Component {name: 'UserCard'})
RETURN parent.name, parent.file

// Full render tree for a route
MATCH path = (r:Route {path: '/dashboard'})-[:ROUTES_TO]->(c:Component)-[:RENDERS*]->(leaf:Component)
RETURN path
```

**R10.2: State Dependency Analysis**

```cypher
// What components depend on auth state?
MATCH (c:Component)-[:CONSUMES_CONTEXT]->(s:UIState {name: 'AuthContext'})
RETURN c.name, c.file

// What happens when user clicks "Delete"?
MATCH (e:EventHandler {event_type: 'click'})-[:MUTATES]->(s:UIState)
WHERE e.name CONTAINS 'delete'
RETURN e.name, s.name, e.file
```

**R10.3: Props Drilling Detection**

```cypher
// Find props passed through 3+ levels
MATCH path = (root:Component)-[:PASSES_PROP*3..]->(leaf:Component)
WHERE ALL(r IN relationships(path) WHERE r.prop_name = relationships(path)[0].prop_name)
RETURN path, length(path) as depth
ORDER BY depth DESC
```

---

## Part 8: Integration

### R11: Mesh Builder Integration

**R11.1: Schema Files**

Create framework-specific schemas:
- `schemas/frameworks/react.json`
- `schemas/frameworks/vue.json`
- `schemas/frameworks/angular.json`
- `schemas/frameworks/svelte.json`

**R11.2: Extractor Classes**

```typescript
// src/mesh-builder/src/extractors/ui/
export class ReactExtractor extends BaseUIExtractor { ... }
export class VueExtractor extends BaseUIExtractor { ... }
export class AngularExtractor extends BaseUIExtractor { ... }
export class SvelteExtractor extends BaseUIExtractor { ... }
```

**R11.3: Graph Store Extensions**

Add UI-specific node and edge types to Neo4j schema.

---

## Success Criteria

| Metric | Target |
|--------|--------|
| React component detection accuracy | > 95% |
| Vue SFC parsing accuracy | > 95% |
| Angular decorator extraction | > 90% |
| Hook dependency graph completeness | > 85% |
| State flow tracing accuracy | > 80% |
| Props type extraction | > 90% |
| Route-to-component mapping | > 95% |
| Extraction time (1000 component app) | < 30s |

---

## Implementation Phases

### Phase 1: React Core (P0)
- Functional component detection
- Hook extraction (built-in + custom)
- JSX child component parsing
- Props interface extraction
- Basic state tracking

### Phase 2: State & Routing (P0)
- Redux/RTK extraction
- Zustand extraction
- React Router extraction
- Next.js App Router

### Phase 3: Vue Support (P1)
- SFC parsing
- Composition API extraction
- Pinia store extraction
- Vue Router

### Phase 4: Angular Support (P1)
- Decorator-based extraction
- Template parsing
- Service/DI extraction
- NgRx

### Phase 5: Advanced Analysis (P2)
- Cross-component state flow
- Props drilling detection
- Render optimization hints
- Bundle impact analysis

---

## Open Questions

1. **Template Parsing Depth**: How deeply should we parse JSX/templates? Full AST or pattern-based?
2. **CSS Extraction**: Should we extract styling relationships (styled-components, CSS modules)?
3. **Build Tool Integration**: Should we integrate with Vite/Webpack for module resolution?
4. **Server Components**: How to handle React Server Components vs Client Components?

---

## References

- React Documentation: https://react.dev
- Vue 3 Composition API: https://vuejs.org/guide/extras/composition-api-faq
- Angular Component Guide: https://angular.io/guide/component-overview
- Svelte Documentation: https://svelte.dev/docs
