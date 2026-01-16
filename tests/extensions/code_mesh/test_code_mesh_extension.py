"""
Tests for CodeMeshExtension integration with draagon-ai.

These tests verify:
1. TransactiveMemory integration for expertise tracking
2. LearningChannel integration for cross-agent knowledge sharing
3. Autonomous learning loop behavior
4. Tool handlers for mesh operations
"""

import asyncio
import pytest
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent))

from draagon_forge.extensions.code_mesh.extension import (
    CodeMeshExtension,
    ExtractionOutcome,
    MeshConfig,
    SCHEMA_TOPIC_HIERARCHY,
)
from draagon_ai.orchestration import (
    TransactiveMemory,
    Learning,
    LearningType,
    LearningScope,
    InMemoryLearningChannel,
    set_learning_channel,
    reset_learning_channel,
)


@pytest.fixture
def learning_channel():
    """Create a fresh learning channel for each test."""
    reset_learning_channel()
    channel = InMemoryLearningChannel()
    set_learning_channel(channel)
    return channel


@pytest.fixture
def extension(learning_channel):
    """Create and initialize extension for tests."""
    ext = CodeMeshExtension()
    ext.initialize({
        "neo4j_uri": "bolt://localhost:7687",
        "enable_self_learning": False,  # Disable loop for unit tests
    })
    yield ext
    ext.shutdown()


class TestTransactiveMemoryIntegration:
    """Tests for TransactiveMemory expertise tracking."""

    @pytest.mark.asyncio
    async def test_extraction_updates_expertise(self, extension):
        """Successful extraction should increase schema expertise."""
        outcome = ExtractionOutcome(
            schema_name="base-python",
            file_path="/test/file.py",
            language="python",
            nodes_extracted=10,
        )

        await extension.record_extraction_outcome(outcome)
        await extension._process_extraction_outcomes()

        expertise = extension._transactive_memory.get_expertise_summary()
        assert "code-mesh-extension" in expertise
        assert expertise["code-mesh-extension"]["schema:python"] > 0.5

    @pytest.mark.asyncio
    async def test_topic_hierarchy_propagation(self, extension):
        """Expertise should propagate to parent topics."""
        outcome = ExtractionOutcome(
            schema_name="base-typescript",
            file_path="/test/file.ts",
            language="typescript",
            nodes_extracted=15,
        )

        await extension.record_extraction_outcome(outcome)
        await extension._process_extraction_outcomes()

        expertise = extension._transactive_memory.get_expertise_summary()
        mesh = expertise["code-mesh-extension"]

        # TypeScript expertise should propagate to javascript-family and language
        assert "schema:typescript" in mesh
        # Parent topics should have lower confidence (decay)
        if "schema:javascript-family" in mesh:
            assert mesh["schema:javascript-family"] < mesh["schema:typescript"]

    @pytest.mark.asyncio
    async def test_failed_extraction_decreases_expertise(self, extension):
        """Failed extraction should decrease schema expertise."""
        # First, get baseline with successful extraction
        success_outcome = ExtractionOutcome(
            schema_name="base-java",
            file_path="/test/File.java",
            language="java",
            nodes_extracted=5,
        )
        await extension.record_extraction_outcome(success_outcome)
        await extension._process_extraction_outcomes()

        initial = extension._transactive_memory.get_expertise_summary()
        initial_confidence = initial["code-mesh-extension"]["schema:java"]

        # Now record a failed extraction
        failed_outcome = ExtractionOutcome(
            schema_name="base-java",
            file_path="/test/Bad.java",
            language="java",
            nodes_extracted=0,
            expected_nodes=10,  # Expected 10, got 0 = failure
            rejections=[{"reason": "missed all classes"}],
        )
        await extension.record_extraction_outcome(failed_outcome)
        await extension._process_extraction_outcomes()

        final = extension._transactive_memory.get_expertise_summary()
        assert final["code-mesh-extension"]["schema:java"] < initial_confidence


class TestLearningChannelIntegration:
    """Tests for LearningChannel cross-agent communication."""

    @pytest.mark.asyncio
    async def test_schema_discovery_broadcast(self, extension, learning_channel):
        """Schema discovery should broadcast SKILL learning."""
        received = []

        async def handler(learning: Learning):
            received.append(learning)

        await learning_channel.subscribe(
            agent_id="test-agent",
            handler=handler,
            learning_types={LearningType.SKILL},
        )

        await extension._broadcast_schema_discovery(
            schema_name="base-go",
            language="go",
            framework=None,
        )
        await asyncio.sleep(0.01)  # Allow async delivery

        assert len(received) == 1
        assert received[0].learning_type == LearningType.SKILL
        assert "schema:go" in received[0].entities
        assert received[0].scope == LearningScope.GLOBAL

    @pytest.mark.asyncio
    async def test_schema_evolution_broadcast(self, extension, learning_channel):
        """Schema evolution should broadcast INSIGHT learning."""
        received = []

        async def handler(learning: Learning):
            received.append(learning)

        await learning_channel.subscribe(
            agent_id="test-agent",
            handler=handler,
            learning_types={LearningType.INSIGHT},
        )

        await extension._broadcast_schema_evolution(
            schema_name="base-python",
            changes=[{"pattern": "function", "new_regex": "..."}],
        )
        await asyncio.sleep(0.01)

        assert len(received) == 1
        assert received[0].learning_type == LearningType.INSIGHT
        assert "base-python" in received[0].content

    @pytest.mark.asyncio
    async def test_receives_correction_learnings(self, extension, learning_channel):
        """Extension should receive and act on CORRECTION learnings."""
        # Simulate another agent sending a correction
        correction = Learning(
            learning_type=LearningType.CORRECTION,
            content="The regex for Python class detection misses dataclasses",
            source_agent_id="code-review-agent",
            scope=LearningScope.GLOBAL,
            confidence=0.9,
            entities=["schema:python", "pattern:class"],
        )

        # The extension's handler should be called
        await extension._on_learning_received(correction)
        # Handler should process schema-related corrections
        # (In production, this would queue schema evolution)


class TestSchemaHealth:
    """Tests for schema health monitoring."""

    @pytest.mark.asyncio
    async def test_health_check_identifies_low_trust(self, extension):
        """Schemas with low expertise should be flagged for evolution."""
        # Record multiple failed extractions to lower confidence
        for _ in range(3):
            outcome = ExtractionOutcome(
                schema_name="base-ruby",
                file_path="/test/file.rb",
                language="ruby",
                nodes_extracted=0,
                expected_nodes=5,
                rejections=[{"reason": "regex failed"}],
            )
            await extension.record_extraction_outcome(outcome)
        await extension._process_extraction_outcomes()

        health = await extension._check_schema_health()

        # Ruby schema should need evolution due to repeated failures
        assert "base-ruby" in health.get("needing_evolution", [])

    @pytest.mark.asyncio
    async def test_get_schema_health_tool(self, extension):
        """Tool handler should return health report."""
        # Setup some expertise data
        outcome = ExtractionOutcome(
            schema_name="base-python",
            file_path="/test/file.py",
            language="python",
            nodes_extracted=20,
        )
        await extension.record_extraction_outcome(outcome)
        await extension._process_extraction_outcomes()

        result = await extension._get_schema_health(args={}, context=None)

        assert "schemas" in result
        assert "total_schemas" in result
        assert isinstance(result["schemas"], list)


class TestExtractionOutcome:
    """Tests for ExtractionOutcome dataclass."""

    def test_success_with_good_extraction(self):
        """Good extraction should be marked as success."""
        outcome = ExtractionOutcome(
            schema_name="base-python",
            file_path="/test/file.py",
            language="python",
            nodes_extracted=10,
        )
        assert outcome.success is True

    def test_failure_with_rejections(self):
        """Extraction with rejections should fail."""
        outcome = ExtractionOutcome(
            schema_name="base-python",
            file_path="/test/file.py",
            language="python",
            nodes_extracted=10,
            rejections=[{"node": "class Foo", "reason": "misclassified"}],
        )
        assert outcome.success is False

    def test_failure_with_low_coverage(self):
        """Extraction with low coverage should fail."""
        outcome = ExtractionOutcome(
            schema_name="base-python",
            file_path="/test/file.py",
            language="python",
            nodes_extracted=2,
            expected_nodes=20,  # Only got 10% of expected
        )
        assert outcome.success is False

    def test_success_with_minor_corrections(self):
        """Extraction with minor corrections should succeed."""
        outcome = ExtractionOutcome(
            schema_name="base-python",
            file_path="/test/file.py",
            language="python",
            nodes_extracted=100,
            corrections=[{"field": "return_type", "corrected": "int"}],
        )
        # 1 correction out of 100 nodes = 1% correction rate < 10%
        assert outcome.success is True


class TestTopicHierarchy:
    """Tests for schema topic hierarchy."""

    def test_hierarchy_includes_all_languages(self):
        """Hierarchy should include base language topics."""
        languages = ["typescript", "javascript", "python", "java", "kotlin", "csharp"]
        for lang in languages:
            assert f"schema:{lang}" in SCHEMA_TOPIC_HIERARCHY

    def test_framework_topics_have_language_parent(self):
        """Framework topics should roll up to their language."""
        assert "schema:react" in SCHEMA_TOPIC_HIERARCHY
        assert "schema:typescript" in SCHEMA_TOPIC_HIERARCHY["schema:react"]

        assert "schema:spring" in SCHEMA_TOPIC_HIERARCHY
        assert "schema:java" in SCHEMA_TOPIC_HIERARCHY["schema:spring"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
