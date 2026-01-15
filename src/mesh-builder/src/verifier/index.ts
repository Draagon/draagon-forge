/**
 * Verifier Module - Tier 2 LLM verification for extraction accuracy.
 *
 * This module provides:
 * - Tier2Verifier: LLM-based verification and correction
 * - TrustScoringEngine: Track pattern reliability over time
 * - Adaptive sampling: Reduce verification as trust builds
 */

export {
  Tier2Verifier,
  VerificationRequest,
  VerificationResult,
  Tier2Config,
  applyCorrections,
} from './Tier2Verifier';

export {
  TrustScoringEngine,
  TrustScore,
  TrustConfig,
  formatTrustReport,
} from './TrustScoringEngine';
