/**
 * Cross-Project Linking module.
 *
 * Provides components for detecting and linking references across projects:
 * - ReferenceCollector: Extract external references from mesh data
 * - ConfigResolver: Resolve environment variables and config values
 * - CrossProjectMatcher: Match references between projects
 * - CrossServiceLinker: Create graph edges for matches
 */

export {
  ReferenceCollector,
  ExternalReference,
  ReferenceType,
  CollectorConfig,
} from './ReferenceCollector';

export {
  ConfigResolver,
  ResolvedConfig,
  ConfigResolverOptions,
} from './ConfigResolver';

export {
  CrossProjectMatcher,
  MatchCandidate,
  MatcherConfig,
} from './CrossProjectMatcher';

export {
  CrossServiceLinker,
  LinkingResult,
  LinkingStats,
  LinkerConfig,
} from './CrossServiceLinker';
