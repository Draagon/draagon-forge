/**
 * TrustScoringEngine - Tracks extraction pattern reliability over time.
 *
 * Uses a hybrid storage approach:
 * - Local JSON file for fast access
 * - Neo4j for persistence and cross-project learning
 *
 * Trust levels determine how often Tier 2 verification is applied:
 * - low: 100% verification (all extractions)
 * - medium: 50% verification
 * - high: 20% verification
 * - trusted: 5% verification (spot checks only)
 */

import * as fs from 'fs';
import * as path from 'path';

export interface TrustScore {
  schema_id: string;
  pattern_name: string;
  language: string;

  // Metrics
  extractions_total: number;
  extractions_verified: number;
  extractions_corrected: number;
  extractions_rejected: number;

  // Computed scores (0.0 - 1.0)
  accuracy_score: number;
  correction_rate: number;
  rejection_rate: number;

  // Trust level
  trust_level: 'low' | 'medium' | 'high' | 'trusted';
  tier2_sample_rate: number;

  // Timestamps
  created_at: string;
  last_updated: string;
}

export interface TrustConfig {
  localStoragePath: string;
  neo4jEnabled: boolean;
  neo4jUri?: string;
  neo4jUser?: string;
  neo4jPassword?: string;

  // Thresholds for trust levels
  thresholds: {
    high_accuracy: number; // accuracy_score >= this for 'high' trust
    trusted_accuracy: number; // accuracy_score >= this for 'trusted'
    low_correction_rate: number; // correction_rate <= this for 'high' trust
    trusted_correction_rate: number; // correction_rate <= this for 'trusted'
  };
}

const DEFAULT_CONFIG: TrustConfig = {
  localStoragePath: path.join(
    process.env.HOME || '~',
    '.draagon-forge',
    'trust-scores.json'
  ),
  neo4jEnabled: false,
  thresholds: {
    high_accuracy: 0.9,
    trusted_accuracy: 0.95,
    low_correction_rate: 0.1,
    trusted_correction_rate: 0.05,
  },
};

export class TrustScoringEngine {
  private config: TrustConfig;
  private scores: Map<string, TrustScore>;
  private dirty: boolean = false;

  constructor(config: Partial<TrustConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scores = new Map();
    this.loadFromLocal();
  }

  /**
   * Get the trust score for a schema/pattern combination.
   */
  getScore(schemaId: string, patternName: string): TrustScore | undefined {
    const key = this.makeKey(schemaId, patternName);
    return this.scores.get(key);
  }

  /**
   * Check if a pattern should be verified based on trust level sampling.
   */
  shouldVerify(schemaId: string, patternName: string): boolean {
    const score = this.getScore(schemaId, patternName);

    // No trust score yet - always verify to build trust
    if (!score) {
      return true;
    }

    // Sample based on trust level
    return Math.random() < score.tier2_sample_rate;
  }

  /**
   * Record a verification result and update trust scores.
   */
  recordVerification(
    schemaId: string,
    patternName: string,
    language: string,
    result: 'verified' | 'corrected' | 'rejected'
  ): void {
    const key = this.makeKey(schemaId, patternName);
    let score = this.scores.get(key);

    if (!score) {
      score = this.createInitialScore(schemaId, patternName, language);
      this.scores.set(key, score);
    }

    // Update metrics
    score.extractions_total++;

    switch (result) {
      case 'verified':
        score.extractions_verified++;
        break;
      case 'corrected':
        score.extractions_corrected++;
        break;
      case 'rejected':
        score.extractions_rejected++;
        break;
    }

    // Recalculate derived scores
    this.recalculateScore(score);

    score.last_updated = new Date().toISOString();
    this.dirty = true;
  }

  /**
   * Batch record verifications.
   */
  recordVerificationBatch(
    records: Array<{
      schemaId: string;
      patternName: string;
      language: string;
      result: 'verified' | 'corrected' | 'rejected';
    }>
  ): void {
    for (const record of records) {
      this.recordVerification(
        record.schemaId,
        record.patternName,
        record.language,
        record.result
      );
    }
    this.saveToLocal();
  }

  /**
   * Get all trust scores for reporting.
   */
  getAllScores(): TrustScore[] {
    return Array.from(this.scores.values());
  }

  /**
   * Get scores filtered by language or trust level.
   */
  getScoresByLanguage(language: string): TrustScore[] {
    return this.getAllScores().filter((s) => s.language === language);
  }

  getScoresByTrustLevel(level: TrustScore['trust_level']): TrustScore[] {
    return this.getAllScores().filter((s) => s.trust_level === level);
  }

  /**
   * Get summary statistics.
   */
  getSummary(): {
    total_patterns: number;
    by_trust_level: Record<TrustScore['trust_level'], number>;
    average_accuracy: number;
    total_extractions: number;
    total_corrections: number;
  } {
    const scores = this.getAllScores();
    const byLevel: Record<TrustScore['trust_level'], number> = {
      low: 0,
      medium: 0,
      high: 0,
      trusted: 0,
    };

    let totalAccuracy = 0;
    let totalExtractions = 0;
    let totalCorrections = 0;

    for (const score of scores) {
      byLevel[score.trust_level]++;
      totalAccuracy += score.accuracy_score;
      totalExtractions += score.extractions_total;
      totalCorrections += score.extractions_corrected;
    }

    return {
      total_patterns: scores.length,
      by_trust_level: byLevel,
      average_accuracy: scores.length > 0 ? totalAccuracy / scores.length : 0,
      total_extractions: totalExtractions,
      total_corrections: totalCorrections,
    };
  }

  /**
   * Save trust scores to local storage.
   */
  saveToLocal(): void {
    if (!this.dirty) return;

    try {
      const dir = path.dirname(this.config.localStoragePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        version: '1.0',
        updated_at: new Date().toISOString(),
        scores: Array.from(this.scores.entries()).map(([key, score]) => ({
          key,
          ...score,
        })),
      };

      fs.writeFileSync(this.config.localStoragePath, JSON.stringify(data, null, 2));
      this.dirty = false;
    } catch (error) {
      console.error('Failed to save trust scores:', error);
    }
  }

  /**
   * Load trust scores from local storage.
   */
  private loadFromLocal(): void {
    try {
      if (!fs.existsSync(this.config.localStoragePath)) {
        return;
      }

      const content = fs.readFileSync(this.config.localStoragePath, 'utf-8');
      const data = JSON.parse(content) as {
        scores: Array<{ key: string } & TrustScore>;
      };

      for (const item of data.scores) {
        const { key, ...score } = item;
        this.scores.set(key, score);
      }
    } catch (error) {
      console.error('Failed to load trust scores:', error);
    }
  }

  /**
   * Create an initial trust score for a new pattern.
   */
  private createInitialScore(
    schemaId: string,
    patternName: string,
    language: string
  ): TrustScore {
    const now = new Date().toISOString();
    return {
      schema_id: schemaId,
      pattern_name: patternName,
      language,
      extractions_total: 0,
      extractions_verified: 0,
      extractions_corrected: 0,
      extractions_rejected: 0,
      accuracy_score: 0,
      correction_rate: 0,
      rejection_rate: 0,
      trust_level: 'low',
      tier2_sample_rate: 1.0, // Verify all until we build trust
      created_at: now,
      last_updated: now,
    };
  }

  /**
   * Recalculate derived scores and trust level.
   */
  private recalculateScore(score: TrustScore): void {
    const total = score.extractions_total;

    if (total === 0) {
      score.accuracy_score = 0;
      score.correction_rate = 0;
      score.rejection_rate = 0;
      score.trust_level = 'low';
      score.tier2_sample_rate = 1.0;
      return;
    }

    // Calculate rates
    score.accuracy_score = score.extractions_verified / total;
    score.correction_rate = score.extractions_corrected / total;
    score.rejection_rate = score.extractions_rejected / total;

    // Determine trust level based on thresholds
    const { thresholds } = this.config;

    if (
      score.accuracy_score >= thresholds.trusted_accuracy &&
      score.correction_rate <= thresholds.trusted_correction_rate &&
      total >= 100 // Require minimum samples for trusted
    ) {
      score.trust_level = 'trusted';
      score.tier2_sample_rate = 0.05;
    } else if (
      score.accuracy_score >= thresholds.high_accuracy &&
      score.correction_rate <= thresholds.low_correction_rate &&
      total >= 50
    ) {
      score.trust_level = 'high';
      score.tier2_sample_rate = 0.2;
    } else if (score.accuracy_score >= 0.8 && total >= 20) {
      score.trust_level = 'medium';
      score.tier2_sample_rate = 0.5;
    } else {
      score.trust_level = 'low';
      score.tier2_sample_rate = 1.0;
    }
  }

  /**
   * Create a unique key for a schema/pattern combination.
   */
  private makeKey(schemaId: string, patternName: string): string {
    return `${schemaId}::${patternName}`;
  }

  /**
   * Sync to Neo4j (if enabled).
   */
  async syncToNeo4j(): Promise<void> {
    if (!this.config.neo4jEnabled) return;

    // TODO: Implement Neo4j sync
    // This would create TrustScore nodes linked to Schema nodes
    // and allow cross-project trust learning
    console.log('Neo4j sync not yet implemented');
  }
}

/**
 * Format trust scores as a human-readable report.
 */
export function formatTrustReport(engine: TrustScoringEngine): string {
  const summary = engine.getSummary();
  const scores = engine.getAllScores();

  let report = `
# Trust Score Report

## Summary
- Total Patterns Tracked: ${summary.total_patterns}
- Total Extractions: ${summary.total_extractions}
- Total Corrections: ${summary.total_corrections}
- Average Accuracy: ${(summary.average_accuracy * 100).toFixed(1)}%

## By Trust Level
- Trusted (5% sample): ${summary.by_trust_level.trusted}
- High (20% sample): ${summary.by_trust_level.high}
- Medium (50% sample): ${summary.by_trust_level.medium}
- Low (100% verify): ${summary.by_trust_level.low}

## Pattern Details
`;

  // Sort by accuracy descending
  const sorted = [...scores].sort((a, b) => b.accuracy_score - a.accuracy_score);

  for (const score of sorted.slice(0, 20)) {
    report += `
### ${score.schema_id}::${score.pattern_name}
- Language: ${score.language}
- Trust Level: ${score.trust_level.toUpperCase()}
- Accuracy: ${(score.accuracy_score * 100).toFixed(1)}%
- Corrections: ${score.extractions_corrected}/${score.extractions_total}
- Sample Rate: ${(score.tier2_sample_rate * 100).toFixed(0)}%
`;
  }

  return report;
}
