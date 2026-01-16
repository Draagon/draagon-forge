"""
Code Knowledge Mesh Extension for Draagon-AI.

This extension provides self-improving code analysis capabilities:
- Tiered extraction (regex -> LLM verification -> LLM discovery)
- Automatic schema generation for unknown frameworks
- Pattern evolution based on verification feedback
- Trust scoring for extraction quality
- Multi-project mesh with cross-repo linking

The extension integrates with draagon-ai's learning infrastructure:
- TransactiveMemory for expertise tracking
- LearningChannel for broadcasting discoveries
- Multi-agent routing for code analysis queries
"""

from .extension import CodeMeshExtension

__all__ = ["CodeMeshExtension"]
