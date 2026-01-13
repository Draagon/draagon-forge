/**
 * Curiosity Engine - Proactive question generation
 *
 * The Curiosity Engine analyzes code and context to generate
 * clarifying questions that help improve understanding of
 * the codebase and developer intent.
 */

import * as vscode from "vscode";

export interface CuriosityQuestion {
    id: string;
    question: string;
    context: string;
    priority: "high" | "medium" | "low";
    domain?: string;
    createdAt: Date;
}

export class CuriosityEngine implements vscode.Disposable {
    private questionsAskedToday: number = 0;
    private maxQuestionsPerDay: number;

    constructor() {
        const config = vscode.workspace.getConfiguration("draagon-forge.curiosity");
        this.maxQuestionsPerDay = config.get<number>("maxQuestionsPerDay", 3);
    }

    /**
     * Generate curiosity questions based on recent activity.
     */
    async generateQuestions(_context: string): Promise<CuriosityQuestion[]> {
        if (this.questionsAskedToday >= this.maxQuestionsPerDay) {
            return [];
        }

        // TODO: Implement LLM-based question generation
        // - Analyze context for gaps in understanding
        // - Generate relevant, non-intrusive questions
        // - Prioritize based on importance
        return [];
    }

    /**
     * Record that a question was asked.
     */
    recordQuestionAsked(): void {
        this.questionsAskedToday++;
    }

    /**
     * Reset daily question count (called at midnight).
     */
    resetDailyCount(): void {
        this.questionsAskedToday = 0;
    }

    dispose(): void {
        // Cleanup if needed
    }
}
