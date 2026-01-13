#!/usr/bin/env python3
"""Seed the Draagon Forge memory with initial beliefs from CLAUDE.md.

Usage:
    python -m draagon_forge.mcp.seed
    python -m draagon_forge.mcp.seed --claude-md ./CLAUDE.md
"""

import asyncio
import argparse
import sys
from pathlib import Path
from datetime import datetime
import uuid

import structlog

from draagon_forge.mcp.memory import initialize_memory, get_memory
from draagon_forge.mcp.models import Belief

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.dev.ConsoleRenderer(),
    ]
)

logger = structlog.get_logger(__name__)

# Core beliefs to seed
CORE_BELIEFS = [
    # LLM-First Architecture
    {
        "content": "NEVER use regex or keyword patterns for semantic understanding. The LLM handles ALL semantic analysis.",
        "category": "architecture",
        "domain": "llm",
        "conviction": 0.95,
        "rationale": "Regex fails at understanding intent, context, and nuance that LLMs handle naturally",
    },
    {
        "content": "Use XML format for LLM output, NOT JSON. XML is more robust for parsing from LLM responses.",
        "category": "patterns",
        "domain": "llm",
        "conviction": 0.9,
        "rationale": "XML handles nested content and special characters better in LLM outputs",
    },
    # Development Principles
    {
        "content": "Always push disposables to context.subscriptions in VS Code extensions to prevent resource leaks.",
        "category": "patterns",
        "domain": "vscode",
        "conviction": 0.95,
        "rationale": "Prevents memory leaks and ensures proper cleanup",
    },
    {
        "content": "Use Content Security Policy (CSP) with nonce for all webview scripts in VS Code extensions.",
        "category": "security",
        "domain": "vscode",
        "conviction": 0.9,
        "rationale": "Prevents XSS attacks in extension webviews",
    },
    {
        "content": "Always use type hints in Python function signatures.",
        "category": "code-style",
        "domain": "python",
        "conviction": 0.85,
        "rationale": "Improves code readability and enables better IDE support",
    },
    {
        "content": "Test outcomes, not implementation details. Validate behavior, not internal mechanics.",
        "category": "testing",
        "domain": "general",
        "conviction": 0.9,
        "rationale": "Makes tests more resilient to refactoring",
    },
    {
        "content": "Never weaken tests to make them pass. Fix the bug instead of lowering thresholds.",
        "category": "testing",
        "domain": "general",
        "conviction": 0.95,
        "rationale": "Maintains test integrity and catches real issues",
    },
    # Belief System
    {
        "content": "Store learned knowledge as beliefs with conviction scores. Reinforce (+0.05) on positive outcomes, weaken (-0.08) on negative.",
        "category": "architecture",
        "domain": "beliefs",
        "conviction": 0.85,
        "rationale": "Allows the system to learn and adapt based on feedback",
    },
    {
        "content": "Use severity levels for watch rules: block (prevent save), warn (notify), suggest (inline hint).",
        "category": "patterns",
        "domain": "watchlist",
        "conviction": 0.9,
        "rationale": "Provides appropriate response levels based on violation severity",
    },
    # Error Handling
    {
        "content": "Always handle errors gracefully with user-friendly messages and logging for debugging.",
        "category": "patterns",
        "domain": "general",
        "conviction": 0.85,
        "rationale": "Improves user experience and makes debugging easier",
    },
    {
        "content": "Use structured logging (structlog) for consistent log formatting and analysis.",
        "category": "patterns",
        "domain": "python",
        "conviction": 0.8,
        "rationale": "Makes logs easier to parse and analyze",
    },
    # MCP Protocol
    {
        "content": "MCP requires JSON-RPC 2.0 format with proper initialization handshake before tool calls.",
        "category": "architecture",
        "domain": "mcp",
        "conviction": 0.95,
        "rationale": "Required by the MCP protocol specification",
    },
    {
        "content": "FastMCP tools should use async functions and return serializable data structures.",
        "category": "patterns",
        "domain": "mcp",
        "conviction": 0.9,
        "rationale": "Ensures compatibility with MCP protocol and async operations",
    },
]


async def seed_beliefs() -> None:
    """Seed the memory with core beliefs."""
    logger.info("Initializing memory...")
    await initialize_memory()

    memory = get_memory()

    logger.info(f"Seeding {len(CORE_BELIEFS)} core beliefs...")

    for belief_data in CORE_BELIEFS:
        belief = Belief(
            id=f"belief-{uuid.uuid4().hex[:8]}",
            content=belief_data["content"],
            conviction=belief_data["conviction"],
            category=belief_data.get("category"),
            domain=belief_data.get("domain"),
            source="seed",
            usage_count=0,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            metadata={"rationale": belief_data.get("rationale", "")},
        )

        await memory.store_belief(belief)
        logger.info(f"Stored: {belief.content[:60]}...")

    logger.info("Seeding complete!")


async def main():
    parser = argparse.ArgumentParser(description="Seed Draagon Forge memory")
    parser.add_argument(
        "--claude-md",
        type=Path,
        help="Path to CLAUDE.md file to parse for additional beliefs",
    )
    args = parser.parse_args()

    await seed_beliefs()

    if args.claude_md:
        logger.info(f"TODO: Parse additional beliefs from {args.claude_md}")


if __name__ == "__main__":
    asyncio.run(main())
