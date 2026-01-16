#!/usr/bin/env python3
"""
Real extraction test that invokes mesh-builder on actual projects.

This test:
1. Extracts real projects using mesh-builder CLI
2. Records outcomes in the extension
3. Verifies expertise tracking reflects real extraction quality
4. Tests the self-improvement detection for problem schemas
"""

import asyncio
import json
import os
import subprocess
import sys
import time
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

from draagon_forge.extensions.code_mesh.extension import (
    CodeMeshExtension,
    ExtractionOutcome,
)
from draagon_ai.orchestration import (
    InMemoryLearningChannel,
    set_learning_channel,
    reset_learning_channel,
    Learning,
    LearningType,
)


def run_mesh_builder(project_path: str) -> dict:
    """Run mesh-builder extraction and return results."""
    mesh_builder = Path(__file__).parent.parent.parent.parent / "src/mesh-builder/dist/cli/index.js"

    if not mesh_builder.exists():
        raise FileNotFoundError(f"mesh-builder not found at {mesh_builder}")

    cmd = [
        "node",
        str(mesh_builder),
        "extract",
        project_path,
        "--verbose",
    ]

    print(f"  Running: {' '.join(cmd[:4])}...")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(Path(__file__).parent.parent.parent.parent),
        )

        # Parse output for statistics - use stdout only (JSON is on stdout)
        stats = parse_extraction_stats(result.stdout)
        stats["success"] = result.returncode == 0

        return stats

    except subprocess.TimeoutExpired:
        return {"success": False, "error": "timeout", "output": ""}
    except Exception as e:
        return {"success": False, "error": str(e), "output": ""}


def parse_extraction_stats(output: str) -> dict:
    """Parse extraction statistics from mesh-builder output."""
    stats = {
        "by_language": {},
        "total_files": 0,
        "total_nodes": 0,
    }

    # The output has some text before the JSON, find the JSON portion
    # Look for the opening brace that starts the JSON
    import re

    # Find the JSON object in the output (starts after "AI enabled: true" line)
    json_start = output.find('{\n  "project_id"')
    if json_start == -1:
        json_start = output.find('{')

    if json_start >= 0:
        try:
            data = json.loads(output[json_start:])

            # Extract statistics
            if "statistics" in data:
                base_stats = data["statistics"]
                stats["total_files"] = base_stats.get("files_processed", 0)
                stats["total_nodes"] = base_stats.get("total_nodes", 0)

            # Extract per-language stats from results
            if "results" in data:
                for result in data["results"]:
                    lang = result.get("language", "unknown")
                    nodes = len(result.get("nodes", []))

                    if lang not in stats["by_language"]:
                        stats["by_language"][lang] = {"nodes": 0, "files": 0}
                    stats["by_language"][lang]["nodes"] += nodes
                    stats["by_language"][lang]["files"] += 1

            return stats

        except json.JSONDecodeError as e:
            print(f"  Warning: Could not parse JSON: {e}")

    return stats


async def main():
    print("\n" + "=" * 70)
    print("REAL EXTRACTION TEST")
    print("=" * 70)

    # Setup
    reset_learning_channel()
    channel = InMemoryLearningChannel()
    set_learning_channel(channel)

    received_learnings = []
    async def capture_learning(learning: Learning):
        received_learnings.append(learning)
        print(f"  📡 Learning: {learning.learning_type.value} - {learning.content[:60]}...")

    await channel.subscribe(
        agent_id="test-observer",
        handler=capture_learning,
        learning_types={LearningType.SKILL, LearningType.INSIGHT},
    )

    extension = CodeMeshExtension()
    extension.initialize({
        "enable_self_learning": False,
        "low_trust_threshold": 0.6,
    })

    # Test projects
    base_path = Path(__file__).parent.parent.parent.parent.parent
    projects = [
        ("draagon-forge", base_path / "draagon-forge"),
        ("draagon-ai", base_path / "draagon-ai"),
    ]

    print("\n" + "-" * 70)
    print("EXTRACTING PROJECTS")
    print("-" * 70)

    for name, path in projects:
        if not path.exists():
            print(f"\n⚠ Skipping {name}: path not found")
            continue

        print(f"\n📦 Extracting: {name}")
        print(f"   Path: {path}")

        start = time.time()
        result = run_mesh_builder(str(path))
        duration = time.time() - start

        if not result.get("success"):
            print(f"   ✗ Failed: {result.get('error', 'unknown')}")
            # Record failure for learning
            outcome = ExtractionOutcome(
                schema_name="unknown",
                file_path=str(path),
                language="unknown",
                nodes_extracted=0,
                rejections=[{"reason": result.get("error", "extraction failed")}],
            )
            await extension.record_extraction_outcome(outcome)
            continue

        print(f"   ✓ Completed in {duration:.1f}s")
        print(f"   Files: {result.get('total_files', 'N/A')}")
        print(f"   Total nodes: {result.get('total_nodes', 'N/A')}")

        # Record outcomes by language
        by_lang = result.get("by_language", {})
        for lang, lang_stats in by_lang.items():
            nodes = lang_stats.get("nodes", 0)
            outcome = ExtractionOutcome(
                schema_name=f"base-{lang}",
                file_path=str(path),
                language=lang,
                nodes_extracted=nodes,
                extraction_time_ms=int(duration * 1000 / max(len(by_lang), 1)),
            )
            await extension.record_extraction_outcome(outcome)
            print(f"     {lang}: {nodes} nodes")

    # Process all outcomes
    print("\n" + "-" * 70)
    print("PROCESSING OUTCOMES FOR LEARNING")
    print("-" * 70)

    await extension._process_extraction_outcomes()

    # Check expertise state
    expertise = extension._transactive_memory.get_expertise_summary()
    mesh = expertise.get("code-mesh-extension", {})

    print("\nExpertise after extraction:")
    for topic, confidence in sorted(mesh.items(), key=lambda x: -x[1]):
        bar = "█" * int(confidence * 20)
        print(f"  {topic}: {bar} {confidence:.2f}")

    # Check schema health
    print("\n" + "-" * 70)
    print("SCHEMA HEALTH CHECK")
    print("-" * 70)

    health = await extension._check_schema_health()
    print(f"Total schemas tracked: {health.get('total_schemas', 0)}")
    print(f"Schemas needing evolution: {health.get('low_trust_count', 0)}")

    if health.get("needing_evolution"):
        print("\nSchemas flagged for evolution:")
        for schema in health["needing_evolution"]:
            print(f"  - {schema}")

    # Test broadcasting a discovery (simulating schema generation)
    print("\n" + "-" * 70)
    print("SIMULATING SCHEMA DISCOVERY")
    print("-" * 70)

    # Pretend we generated a new Kotlin schema
    await extension._broadcast_schema_discovery(
        schema_name="base-kotlin",
        language="kotlin",
        framework=None,
    )
    await asyncio.sleep(0.1)

    # Cleanup
    extension.shutdown()

    # Summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    print(f"Learnings captured: {len(received_learnings)}")
    print(f"Languages tracked: {len([t for t in mesh if t.startswith('schema:') and not '-' in t.split(':')[1]])}")

    print("\n✓ Real extraction test complete!")


if __name__ == "__main__":
    asyncio.run(main())
