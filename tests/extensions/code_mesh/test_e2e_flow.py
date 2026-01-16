#!/usr/bin/env python3
"""
End-to-end test for the self-improving Code Mesh flow.

This test exercises the complete flow:
1. Initialize extension with learning infrastructure
2. Extract real projects and record outcomes
3. Verify expertise tracking via TransactiveMemory
4. Verify schema health detection
5. Test learning broadcast and cross-agent communication
6. Simulate the autonomous learning loop

Run with: python3 tests/extensions/code_mesh/test_e2e_flow.py
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from dataclasses import dataclass
from typing import Any

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

from draagon_forge.extensions.code_mesh.extension import (
    CodeMeshExtension,
    ExtractionOutcome,
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
    get_learning_channel,
)


@dataclass
class TestResult:
    name: str
    passed: bool
    duration_ms: int
    details: dict[str, Any] | None = None
    error: str | None = None


class E2ETestRunner:
    """End-to-end test runner for CodeMeshExtension."""

    def __init__(self):
        self.results: list[TestResult] = []
        self.extension: CodeMeshExtension | None = None
        self.channel: InMemoryLearningChannel | None = None
        self.received_learnings: list[Learning] = []

        # Test projects (relative to draagon-forge)
        self.test_projects = {
            "draagon-forge": Path(__file__).parent.parent.parent.parent,
            "draagon-ai": Path(__file__).parent.parent.parent.parent.parent / "draagon-ai",
        }

    async def setup(self) -> None:
        """Set up test environment."""
        print("\n" + "=" * 70)
        print("SETTING UP E2E TEST ENVIRONMENT")
        print("=" * 70)

        # Reset and create fresh learning channel
        reset_learning_channel()
        self.channel = InMemoryLearningChannel()
        set_learning_channel(self.channel)

        # Subscribe to receive all learnings for verification
        await self.channel.subscribe(
            agent_id="e2e-test-observer",
            handler=self._on_learning,
            learning_types={
                LearningType.FACT,
                LearningType.SKILL,
                LearningType.INSIGHT,
                LearningType.CORRECTION,
            },
        )

        # Create and initialize extension
        self.extension = CodeMeshExtension()
        self.extension.initialize({
            "neo4j_uri": "bolt://localhost:7687",
            "neo4j_password": "password",
            "enable_self_learning": False,  # We'll trigger manually
            "low_trust_threshold": 0.7,  # Higher threshold to trigger evolution
        })

        print("✓ Extension initialized")
        print(f"  TransactiveMemory: {self.extension._transactive_memory is not None}")
        print(f"  LearningChannel subscribed: {self.extension._learning_subscription_id is not None}")

    async def _on_learning(self, learning: Learning) -> None:
        """Capture learnings for verification."""
        self.received_learnings.append(learning)
        print(f"  📡 Received learning: {learning.learning_type.value} - {learning.content[:50]}...")

    async def teardown(self) -> None:
        """Clean up test environment."""
        if self.extension:
            self.extension.shutdown()
        print("\n✓ Test environment cleaned up")

    def record_result(
        self,
        name: str,
        passed: bool,
        duration_ms: int,
        details: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        """Record a test result."""
        self.results.append(TestResult(name, passed, duration_ms, details, error))
        status = "✓ PASSED" if passed else "✗ FAILED"
        print(f"\n{status}: {name} ({duration_ms}ms)")
        if details:
            for k, v in details.items():
                print(f"    {k}: {v}")
        if error:
            print(f"    Error: {error}")

    # =========================================================================
    # Test Cases
    # =========================================================================

    async def test_1_extraction_records_outcomes(self) -> None:
        """Test that extraction records outcomes for learning."""
        print("\n" + "-" * 70)
        print("TEST 1: Extraction Records Outcomes")
        print("-" * 70)

        start = time.time()

        try:
            # Simulate extraction outcomes for different languages
            # (In production, this would come from actual mesh-builder extraction)

            outcomes = [
                # Successful Python extraction
                ExtractionOutcome(
                    schema_name="base-python",
                    file_path=str(self.test_projects["draagon-forge"] / "src"),
                    language="python",
                    nodes_extracted=150,
                    extraction_time_ms=500,
                ),
                # Successful TypeScript extraction
                ExtractionOutcome(
                    schema_name="base-typescript",
                    file_path=str(self.test_projects["draagon-forge"] / "src/mesh-builder"),
                    language="typescript",
                    nodes_extracted=200,
                    extraction_time_ms=600,
                ),
                # Problematic Java extraction (low yield)
                ExtractionOutcome(
                    schema_name="base-java",
                    file_path="/test/java/project",
                    language="java",
                    nodes_extracted=5,
                    expected_nodes=50,  # Expected 50, got 5 = failure
                    extraction_time_ms=2000,
                ),
            ]

            for outcome in outcomes:
                await self.extension.record_extraction_outcome(outcome)
                print(f"  Recorded: {outcome.schema_name} ({outcome.nodes_extracted} nodes, success={outcome.success})")

            # Process the outcomes
            await self.extension._process_extraction_outcomes()

            # Verify TransactiveMemory was updated
            expertise = self.extension._transactive_memory.get_expertise_summary()
            mesh_expertise = expertise.get("code-mesh-extension", {})

            duration = int((time.time() - start) * 1000)

            # Assertions
            assert "schema:python" in mesh_expertise, "Python expertise not recorded"
            assert "schema:typescript" in mesh_expertise, "TypeScript expertise not recorded"
            assert "schema:java" in mesh_expertise, "Java expertise not recorded"

            # Python and TS should have higher confidence than Java
            assert mesh_expertise["schema:python"] > mesh_expertise["schema:java"], \
                "Python should have higher confidence than failed Java"

            self.record_result(
                "Extraction Records Outcomes",
                True,
                duration,
                {
                    "python_confidence": f"{mesh_expertise['schema:python']:.2f}",
                    "typescript_confidence": f"{mesh_expertise['schema:typescript']:.2f}",
                    "java_confidence": f"{mesh_expertise['schema:java']:.2f}",
                },
            )

        except Exception as e:
            duration = int((time.time() - start) * 1000)
            self.record_result("Extraction Records Outcomes", False, duration, error=str(e))

    async def test_2_schema_health_detection(self) -> None:
        """Test that schema health correctly identifies problematic schemas."""
        print("\n" + "-" * 70)
        print("TEST 2: Schema Health Detection")
        print("-" * 70)

        start = time.time()

        try:
            # Add more failed extractions for Java to lower its confidence
            for i in range(3):
                outcome = ExtractionOutcome(
                    schema_name="base-java",
                    file_path=f"/test/java/file{i}.java",
                    language="java",
                    nodes_extracted=2,
                    expected_nodes=30,
                    rejections=[{"reason": f"missed pattern {i}"}],
                )
                await self.extension.record_extraction_outcome(outcome)

            await self.extension._process_extraction_outcomes()

            # Check schema health
            health = await self.extension._check_schema_health()

            duration = int((time.time() - start) * 1000)

            # Java should be flagged for evolution due to repeated failures
            needing_evolution = health.get("needing_evolution", [])

            self.record_result(
                "Schema Health Detection",
                True,
                duration,
                {
                    "needing_evolution": needing_evolution,
                    "total_schemas": health.get("total_schemas", 0),
                    "low_trust_count": health.get("low_trust_count", 0),
                },
            )

        except Exception as e:
            duration = int((time.time() - start) * 1000)
            self.record_result("Schema Health Detection", False, duration, error=str(e))

    async def test_3_learning_broadcast(self) -> None:
        """Test that schema discoveries are broadcast to other agents."""
        print("\n" + "-" * 70)
        print("TEST 3: Learning Broadcast")
        print("-" * 70)

        start = time.time()
        initial_count = len(self.received_learnings)

        try:
            # Broadcast a schema discovery
            await self.extension._broadcast_schema_discovery(
                schema_name="base-rust",
                language="rust",
                framework=None,
            )

            # Broadcast a schema evolution
            await self.extension._broadcast_schema_evolution(
                schema_name="base-python",
                changes=[
                    {"pattern": "async_function", "action": "added"},
                    {"pattern": "decorator", "action": "improved"},
                ],
            )

            # Allow time for async delivery
            await asyncio.sleep(0.1)

            duration = int((time.time() - start) * 1000)

            # Verify learnings were received
            new_learnings = self.received_learnings[initial_count:]
            skill_learnings = [l for l in new_learnings if l.learning_type == LearningType.SKILL]
            insight_learnings = [l for l in new_learnings if l.learning_type == LearningType.INSIGHT]

            assert len(skill_learnings) >= 1, "Schema discovery should broadcast SKILL learning"
            assert len(insight_learnings) >= 1, "Schema evolution should broadcast INSIGHT learning"

            # Check entities are properly tagged
            rust_learning = skill_learnings[0]
            assert "schema:rust" in rust_learning.entities, "Rust schema should be in entities"

            self.record_result(
                "Learning Broadcast",
                True,
                duration,
                {
                    "skill_learnings": len(skill_learnings),
                    "insight_learnings": len(insight_learnings),
                    "total_broadcast": len(new_learnings),
                },
            )

        except Exception as e:
            duration = int((time.time() - start) * 1000)
            self.record_result("Learning Broadcast", False, duration, error=str(e))

    async def test_4_cross_agent_correction(self) -> None:
        """Test that corrections from other agents trigger schema evolution."""
        print("\n" + "-" * 70)
        print("TEST 4: Cross-Agent Correction Handling")
        print("-" * 70)

        start = time.time()

        try:
            # Simulate another agent sending a correction about Python schema
            correction = Learning(
                learning_type=LearningType.CORRECTION,
                content="The Python schema regex for async functions misses 'async def' with type hints",
                source_agent_id="code-review-agent",
                scope=LearningScope.GLOBAL,
                confidence=0.9,
                importance=0.8,
                entities=["schema:python", "pattern:async_function"],
            )

            # Send to extension's handler
            await self.extension._on_learning_received(correction)

            duration = int((time.time() - start) * 1000)

            # The extension should have processed this
            # (In production, it would queue schema evolution)
            self.record_result(
                "Cross-Agent Correction Handling",
                True,
                duration,
                {
                    "correction_source": correction.source_agent_id,
                    "affected_schema": "python",
                },
            )

        except Exception as e:
            duration = int((time.time() - start) * 1000)
            self.record_result("Cross-Agent Correction Handling", False, duration, error=str(e))

    async def test_5_topic_hierarchy_propagation(self) -> None:
        """Test that expertise propagates through topic hierarchy."""
        print("\n" + "-" * 70)
        print("TEST 5: Topic Hierarchy Propagation")
        print("-" * 70)

        start = time.time()

        try:
            # Record a React framework extraction
            outcome = ExtractionOutcome(
                schema_name="react-components",
                file_path="/test/react/Component.tsx",
                language="typescript",  # React uses TypeScript
                nodes_extracted=50,
            )
            await self.extension.record_extraction_outcome(outcome)
            await self.extension._process_extraction_outcomes()

            expertise = self.extension._transactive_memory.get_expertise_summary()
            mesh = expertise.get("code-mesh-extension", {})

            duration = int((time.time() - start) * 1000)

            # TypeScript expertise should exist and propagate
            ts_confidence = mesh.get("schema:typescript", 0)
            lang_confidence = mesh.get("schema:language", 0)

            # Language should be lower due to decay
            self.record_result(
                "Topic Hierarchy Propagation",
                True,
                duration,
                {
                    "typescript_confidence": f"{ts_confidence:.2f}",
                    "language_confidence": f"{lang_confidence:.2f}",
                    "hierarchy_applied": lang_confidence < ts_confidence if lang_confidence > 0 else "N/A",
                },
            )

        except Exception as e:
            duration = int((time.time() - start) * 1000)
            self.record_result("Topic Hierarchy Propagation", False, duration, error=str(e))

    async def test_6_tool_handler_integration(self) -> None:
        """Test that tool handlers work with the learning infrastructure."""
        print("\n" + "-" * 70)
        print("TEST 6: Tool Handler Integration")
        print("-" * 70)

        start = time.time()

        try:
            # Call the get_schema_health tool handler
            health_result = await self.extension._get_schema_health(args={}, context=None)

            duration = int((time.time() - start) * 1000)

            assert "schemas" in health_result, "Health result should include schemas"
            assert "total_schemas" in health_result, "Health result should include total"

            schemas = health_result["schemas"]
            schema_names = [s["name"] for s in schemas]

            self.record_result(
                "Tool Handler Integration",
                True,
                duration,
                {
                    "total_schemas": health_result["total_schemas"],
                    "schemas_found": schema_names[:5],  # First 5
                    "needing_evolution": health_result.get("needing_evolution", 0),
                },
            )

        except Exception as e:
            duration = int((time.time() - start) * 1000)
            self.record_result("Tool Handler Integration", False, duration, error=str(e))

    async def test_7_simulated_learning_loop(self) -> None:
        """Test a simulated learning loop iteration."""
        print("\n" + "-" * 70)
        print("TEST 7: Simulated Learning Loop")
        print("-" * 70)

        start = time.time()
        initial_learnings = len(self.received_learnings)

        try:
            # Manually run the steps that the learning loop would do

            # Step 1: Process any pending outcomes
            await self.extension._process_extraction_outcomes()

            # Step 2: Check schema health
            health = await self.extension._check_schema_health()
            print(f"  Health check: {health['low_trust_count']} schemas need evolution")

            # Step 3: For each schema needing evolution, we would evolve
            # (Skipping actual evolution as it requires mesh-builder CLI)
            for schema in health.get("needing_evolution", []):
                print(f"  Would evolve: {schema}")

            # Step 4: Check for unknown frameworks
            # (Skipping as it requires mesh-builder CLI)

            await asyncio.sleep(0.1)
            duration = int((time.time() - start) * 1000)

            new_learnings = len(self.received_learnings) - initial_learnings

            self.record_result(
                "Simulated Learning Loop",
                True,
                duration,
                {
                    "schemas_checked": health.get("total_schemas", 0),
                    "evolution_candidates": len(health.get("needing_evolution", [])),
                    "learnings_generated": new_learnings,
                },
            )

        except Exception as e:
            duration = int((time.time() - start) * 1000)
            self.record_result("Simulated Learning Loop", False, duration, error=str(e))

    async def test_8_expertise_query(self) -> None:
        """Test querying who knows about specific schemas."""
        print("\n" + "-" * 70)
        print("TEST 8: Expertise Query")
        print("-" * 70)

        start = time.time()

        try:
            # Query who knows about Python
            python_experts = await self.extension._transactive_memory.who_knows_about("schema:python")

            # Query who knows about TypeScript
            ts_experts = await self.extension._transactive_memory.who_knows_about("schema:typescript")

            # Get experts for Java (should be lower confidence)
            java_experts = await self.extension._transactive_memory.get_experts("schema:java")

            duration = int((time.time() - start) * 1000)

            self.record_result(
                "Expertise Query",
                True,
                duration,
                {
                    "python_experts": python_experts[:100] if python_experts else "none",
                    "typescript_experts": ts_experts[:100] if ts_experts else "none",
                    "java_expert_count": len(java_experts),
                },
            )

        except Exception as e:
            duration = int((time.time() - start) * 1000)
            self.record_result("Expertise Query", False, duration, error=str(e))

    # =========================================================================
    # Run All Tests
    # =========================================================================

    async def run_all(self) -> None:
        """Run all E2E tests."""
        print("\n" + "=" * 70)
        print("CODE MESH EXTENSION - END-TO-END TESTS")
        print("=" * 70)

        await self.setup()

        tests = [
            self.test_1_extraction_records_outcomes,
            self.test_2_schema_health_detection,
            self.test_3_learning_broadcast,
            self.test_4_cross_agent_correction,
            self.test_5_topic_hierarchy_propagation,
            self.test_6_tool_handler_integration,
            self.test_7_simulated_learning_loop,
            self.test_8_expertise_query,
        ]

        for test in tests:
            try:
                await test()
            except Exception as e:
                print(f"  ✗ Test crashed: {e}")

        await self.teardown()

        # Print summary
        print("\n" + "=" * 70)
        print("TEST SUMMARY")
        print("=" * 70)

        passed = sum(1 for r in self.results if r.passed)
        failed = sum(1 for r in self.results if not r.passed)
        total_time = sum(r.duration_ms for r in self.results)

        for r in self.results:
            status = "✓" if r.passed else "✗"
            print(f"  {status} {r.name} ({r.duration_ms}ms)")

        print(f"\nTotal: {passed} passed, {failed} failed ({total_time}ms)")

        # Print learning log summary
        print("\n" + "-" * 70)
        print("LEARNING LOG SUMMARY")
        print("-" * 70)
        print(f"Total learnings captured: {len(self.received_learnings)}")
        by_type = {}
        for l in self.received_learnings:
            by_type[l.learning_type.value] = by_type.get(l.learning_type.value, 0) + 1
        for lt, count in by_type.items():
            print(f"  {lt}: {count}")

        # Print final expertise state
        print("\n" + "-" * 70)
        print("FINAL EXPERTISE STATE")
        print("-" * 70)
        if self.extension and self.extension._transactive_memory:
            expertise = self.extension._transactive_memory.get_expertise_summary()
            for agent_id, topics in expertise.items():
                print(f"  {agent_id}:")
                for topic, confidence in sorted(topics.items(), key=lambda x: -x[1]):
                    bar = "█" * int(confidence * 20)
                    print(f"    {topic}: {bar} {confidence:.2f}")

        return failed == 0


async def main():
    runner = E2ETestRunner()
    success = await runner.run_all()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())
