"""Forge agent creation using draagon-ai.

This module provides the main entry point for creating a Forge agent
using draagon-ai as the backend. It wires together:

- LLM providers (Groq for fast inference)
- Memory (draagon-ai's LayeredMemoryProvider with Qdrant)
- Behavior (Forge's personality and actions)
- Tools (search context, beliefs, etc.)

The Agent is the single source of truth - MCP tools also route through it.

Usage:
    from draagon_forge.agent import create_forge_agent

    agent = await create_forge_agent()
    response = await agent.process("What do you think about regex?")
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from draagon_ai.orchestration import Agent, AgentConfig
from draagon_ai.orchestration.protocols import ToolCall, ToolResult
from draagon_ai.memory.embedding import OllamaEmbeddingProvider

from draagon_forge.agent.behavior import FORGE_BEHAVIOR
from draagon_forge.mcp.config import config

if TYPE_CHECKING:
    from draagon_ai.memory import LayeredMemoryProvider

logger = logging.getLogger(__name__)

# Singleton agent and memory - shared between API and MCP
_forge_agent: Agent | None = None
_shared_memory: "LayeredMemoryProvider | None" = None


class ForgeToolProvider:
    """Provides tools to the Forge agent.

    Tools use the shared LayeredMemoryProvider from draagon-ai,
    ensuring consistency between agent operations and direct queries.
    """

    def __init__(self):
        """Initialize the tool provider."""
        self._tools = {
            "search_context": self._search_context,
            "query_beliefs": self._query_beliefs,
            "add_belief": self._add_belief,
            "form_opinion": self._form_opinion,
            "store_learning": self._store_learning,
        }

    async def execute(
        self,
        tool_call: ToolCall,
        context: dict[str, Any],
    ) -> ToolResult:
        """Execute a tool call.

        Args:
            tool_call: The tool to execute with arguments
            context: Execution context

        Returns:
            Tool execution result
        """
        import time
        start_time = time.time()

        tool_name = tool_call.tool_name
        if tool_name not in self._tools:
            return ToolResult(
                tool_name=tool_name,
                success=False,
                result=None,
                error=f"Unknown tool: {tool_name}",
                latency_ms=0,
            )

        try:
            result = await self._tools[tool_name](tool_call.arguments)
            latency_ms = (time.time() - start_time) * 1000
            return ToolResult(
                tool_name=tool_name,
                success=True,
                result=result,
                error=None,
                latency_ms=latency_ms,
            )
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            return ToolResult(
                tool_name=tool_name,
                success=False,
                result=None,
                error=str(e),
                latency_ms=latency_ms,
            )

    def list_tools(self) -> list[str]:
        """List available tool names."""
        return list(self._tools.keys())

    def get_tool_description(self, tool_name: str) -> str | None:
        """Get description of a tool."""
        descriptions = {
            "search_context": "Search semantic memory for relevant principles and patterns",
            "query_beliefs": "Query stored beliefs about a topic",
            "add_belief": "Add a new belief to memory",
            "form_opinion": "Express Forge's opinion on a development topic",
            "store_learning": "Store a new learning from an interaction",
        }
        return descriptions.get(tool_name)

    async def _search_context(self, args: dict) -> list[dict]:
        """Search context using the shared memory provider."""
        memory = get_shared_memory()
        if memory is None:
            return []

        query = args.get("query", "")
        limit = args.get("limit", 5)

        # Use draagon-ai's memory search with user_id for proper scoping
        results = await memory.search(
            query,
            limit=limit,
            user_id=config.user_id,
            agent_id=config.agent_id,
        )

        return [
            {
                "id": str(r.id) if hasattr(r, "id") else str(i),
                "content": r.content if hasattr(r, "content") else str(r),
                "score": r.score if hasattr(r, "score") else 0.8,
                "type": r.metadata.get("type", "memory") if hasattr(r, "metadata") else "memory",
                "source": r.metadata.get("source", "agent") if hasattr(r, "metadata") else "agent",
            }
            for i, r in enumerate(results)
        ]

    async def _query_beliefs(self, args: dict) -> list[dict]:
        """Query beliefs using the shared memory provider."""
        memory = get_shared_memory()
        if memory is None:
            return []

        query = args.get("topic", args.get("query", ""))
        limit = args.get("limit", 5)

        # Search for beliefs with proper user/agent scoping
        from draagon_ai.memory.base import MemoryType
        results = await memory.search(
            query,
            limit=limit,
            user_id=config.user_id,
            agent_id=config.agent_id,
            memory_types=[MemoryType.BELIEF],
        )

        return [
            {
                "id": str(r.id) if hasattr(r, "id") else str(i),
                "content": r.content if hasattr(r, "content") else str(r),
                "conviction": r.metadata.get("conviction", 0.7) if hasattr(r, "metadata") else 0.7,
                "domain": r.metadata.get("domain") if hasattr(r, "metadata") else None,
            }
            for i, r in enumerate(results)
        ]

    async def _add_belief(self, args: dict) -> dict:
        """Add a belief using the shared memory provider."""
        memory = get_shared_memory()
        if memory is None:
            return {"error": "Memory not initialized"}

        content = args.get("content", "")
        category = args.get("category")
        domain = args.get("domain")
        conviction = args.get("conviction", 0.7)

        # Store with proper parameters for LayeredMemoryProvider
        from draagon_ai.memory.base import MemoryType, MemoryScope
        await memory.store(
            content=content,
            memory_type=MemoryType.BELIEF,
            scope=MemoryScope.USER,
            user_id=config.user_id,
            agent_id=config.agent_id,
            confidence=conviction,
            source="agent",
            metadata={
                "category": category,
                "domain": domain,
                "conviction": conviction,
            },
        )

        return {
            "status": "stored",
            "content": content,
            "conviction": conviction,
        }

    async def _form_opinion(self, args: dict) -> dict:
        """Form an opinion based on Forge's personality and beliefs."""
        topic = args.get("topic", "")

        # Search for relevant context
        results = await self._search_context({"query": topic, "limit": 3})

        # Build opinion from personality + beliefs
        opinion = {
            "topic": topic,
            "stance": None,
            "reasoning": None,
            "confidence": 0.7,
            "related_beliefs": results,
        }

        # Check built-in opinions from personality
        from draagon_forge.agent.behavior import FORGE_PERSONALITY
        for personality_opinion in FORGE_PERSONALITY.opinions:
            if topic.lower() in personality_opinion.topic.lower() or personality_opinion.topic.lower() in topic.lower():
                opinion["stance"] = personality_opinion.stance
                opinion["reasoning"] = personality_opinion.reasoning
                opinion["confidence"] = personality_opinion.strength
                break

        if not opinion["stance"] and results:
            # Synthesize from beliefs
            opinion["stance"] = f"Based on our principles: {results[0]['content'][:100]}..."
            opinion["reasoning"] = "Derived from stored beliefs"

        return opinion

    async def _store_learning(self, args: dict) -> dict:
        """Store a learning using the shared memory provider."""
        memory = get_shared_memory()
        if memory is None:
            return {"error": "Memory not initialized"}

        content = args.get("content", "")
        category = args.get("category")
        domain = args.get("domain")
        conviction = args.get("conviction", 0.7)

        # Store with proper parameters for LayeredMemoryProvider
        from draagon_ai.memory.base import MemoryType, MemoryScope
        await memory.store(
            content=content,
            memory_type=MemoryType.INSIGHT,  # Learnings go to metacognitive layer
            scope=MemoryScope.USER,
            user_id=config.user_id,
            agent_id=config.agent_id,
            confidence=conviction,
            source="user_interaction",
            metadata={
                "category": category,
                "domain": domain,
                "conviction": conviction,
            },
        )

        return {
            "status": "stored",
            "content": content,
            "conviction": conviction,
        }


def get_shared_memory() -> "LayeredMemoryProvider | None":
    """Get the shared memory provider used by the Forge agent.

    This allows MCP tools to use the same memory as the agent,
    ensuring consistency between direct queries and agent operations.

    Returns:
        The LayeredMemoryProvider if agent is initialized, None otherwise
    """
    return _shared_memory


async def create_forge_agent() -> Agent:
    """Create or get the singleton Forge agent.

    This is the main entry point for getting a Forge agent. The agent
    is a singleton - calling this multiple times returns the same instance.

    The agent uses:
    - LLM: Groq for fast inference
    - Memory: draagon-ai's LayeredMemoryProvider (shared with MCP tools)
    - Behavior: Forge's personality and actions
    - Tools: search_context, query_beliefs, add_belief, etc.

    Returns:
        Configured Agent instance (singleton)

    Example:
        from draagon_forge.agent import create_forge_agent

        agent = await create_forge_agent()
        response = await agent.process("What do you think about testing?")
    """
    global _forge_agent, _shared_memory

    # Return existing agent if already created
    if _forge_agent is not None:
        return _forge_agent

    logger.info("Creating Forge agent...")

    # Create LLM - use Groq for fast inference
    from draagon_ai.llm import GroqLLM, GroqConfig

    # Get API key from config (loaded from env)
    api_key = config.groq_api_key
    if not api_key:
        raise ValueError(
            "GROQ_API_KEY not set. Set the environment variable or configure it."
        )

    llm = GroqLLM(
        api_key=api_key,
        config=GroqConfig(
            complex_model=config.llm_model,
            deep_model=config.llm_model,
        ),
    )
    logger.info(f"Created LLM provider: {config.llm_model}")

    # Create embedding provider
    embedding_provider = OllamaEmbeddingProvider(
        base_url=config.ollama_url,
        model=config.embedding_model,
        dimension=config.embedding_dimension,
    )
    logger.info(f"Created embedding provider: {config.embedding_model}")

    # Create memory provider - this is the SINGLE source of truth
    from draagon_ai.memory import TemporalCognitiveGraph, LayeredMemoryProvider

    graph = TemporalCognitiveGraph(embedding_provider=embedding_provider)
    memory = LayeredMemoryProvider(graph=graph, embedding_provider=embedding_provider)
    _shared_memory = memory  # Store for MCP tools to use
    logger.info("Created shared memory provider")

    # Create tool provider
    tool_provider = ForgeToolProvider()
    logger.info(f"Created tool provider with {len(tool_provider.list_tools())} tools")

    # Create agent config with personality intro
    from draagon_forge.agent.behavior import FORGE_PERSONALITY
    from draagon_ai.behaviors.personality import compose_personality_intro

    personality_intro = compose_personality_intro(FORGE_PERSONALITY)

    agent_config = AgentConfig(
        agent_id="forge",
        name="Forge",
        personality_intro=personality_intro,
        enable_learning=True,
        enable_proactive=False,
    )

    # Create the agent
    agent = Agent(
        config=agent_config,
        behavior=FORGE_BEHAVIOR,
        llm=llm,
        memory=memory,
        tools=tool_provider,
    )

    _forge_agent = agent  # Store singleton
    logger.info("Forge agent created successfully")
    return agent


async def process_message(agent: Agent, message: str, context: dict | None = None) -> str:
    """Process a message through the Forge agent.

    Args:
        agent: The Forge agent
        message: User message
        context: Optional context (project info, file context, etc.)

    Returns:
        Agent response text
    """
    # Extract user_id from context
    ctx = context or {}
    user_id = ctx.pop("user_id", "developer")
    session_id = ctx.pop("session_id", None)

    # Process through agent
    response = await agent.process(
        query=message,
        user_id=user_id,
        session_id=session_id,
    )

    # Extract text response from AgentResponse
    if hasattr(response, "response"):
        return response.response
    elif hasattr(response, "text"):
        return response.text
    elif hasattr(response, "content"):
        return response.content
    elif isinstance(response, str):
        return response
    else:
        return str(response)
