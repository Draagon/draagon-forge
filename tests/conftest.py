"""Pytest configuration and fixtures for Draagon Forge tests."""

import pytest


@pytest.fixture
def sample_belief() -> dict:
    """Sample belief for testing."""
    return {
        "id": "test-belief-001",
        "content": "Never use regex for semantic understanding",
        "conviction": 0.95,
        "source": "CLAUDE.md",
        "domain": "architecture",
    }


@pytest.fixture
def sample_watch_rule() -> dict:
    """Sample watch rule for testing."""
    return {
        "id": "wr-test-001",
        "name": "No regex for semantics",
        "description": "Block usage of regex for semantic text analysis",
        "pattern": "Using regex to parse or understand natural language",
        "severity": "block",
        "enabled": True,
    }
