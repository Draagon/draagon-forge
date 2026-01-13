"""Event system for real-time monitoring.

Provides event types, emission, and subscription for the Inspector UI.
Events are broadcast to all connected WebSocket clients.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Awaitable
import json
import logging

logger = logging.getLogger(__name__)


class EventType(str, Enum):
    """Types of events that can be emitted."""

    # MCP Events
    MCP_TOOL_CALLED = "mcp.tool.called"
    MCP_TOOL_RESULT = "mcp.tool.result"
    MCP_TOOL_ERROR = "mcp.tool.error"
    MCP_RESOURCE_READ = "mcp.resource.read"

    # Memory Events
    MEMORY_SEARCH = "memory.search"
    MEMORY_SEARCH_RESULT = "memory.search.result"
    MEMORY_STORE = "memory.store"
    MEMORY_RETRIEVE = "memory.retrieve"
    MEMORY_UPDATE = "memory.update"
    MEMORY_DELETE = "memory.delete"

    # Agent Events
    AGENT_DECISION = "agent.decision"
    AGENT_ACTION = "agent.action"
    AGENT_THOUGHT = "agent.thought"
    AGENT_OBSERVATION = "agent.observation"
    AGENT_FINAL_ANSWER = "agent.final_answer"

    # Behavior Events
    BEHAVIOR_ACTIVATED = "behavior.activated"
    BEHAVIOR_EXECUTED = "behavior.executed"
    BEHAVIOR_EVOLVED = "behavior.evolved"

    # Chat Events
    CHAT_MESSAGE = "chat.message"
    CHAT_RESPONSE = "chat.response"

    # System Events
    SYSTEM_STARTUP = "system.startup"
    SYSTEM_SHUTDOWN = "system.shutdown"
    SYSTEM_ERROR = "system.error"
    SYSTEM_USAGE = "system.usage"


@dataclass
class ForgeEvent:
    """An event emitted by Forge for real-time monitoring."""

    event_type: EventType
    data: dict[str, Any]
    source: str = "api"  # "mcp" | "api" | "agent" | "memory"
    timestamp: datetime = field(default_factory=datetime.utcnow)
    duration_ms: float | None = None
    request_id: str | None = None
    user_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "event": self.event_type.value,
            "timestamp": self.timestamp.isoformat() + "Z",
            "source": self.source,
            "data": self.data,
            "duration_ms": self.duration_ms,
            "request_id": self.request_id,
            "user_id": self.user_id,
        }

    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict())


# Type alias for event handlers
EventHandler = Callable[[ForgeEvent], Awaitable[None]]


class EventBus:
    """Central event bus for broadcasting events to subscribers.

    This is a singleton that manages event subscriptions and broadcasting.
    WebSocket connections subscribe here to receive real-time events.
    """

    _instance: "EventBus | None" = None
    _lock: asyncio.Lock = asyncio.Lock()

    def __new__(cls) -> "EventBus":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._handlers: list[EventHandler] = []
            cls._instance._event_history: list[ForgeEvent] = []
            cls._instance._max_history = 1000
        return cls._instance

    @classmethod
    def get_instance(cls) -> "EventBus":
        """Get the singleton EventBus instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def subscribe(self, handler: EventHandler) -> Callable[[], None]:
        """Subscribe to events.

        Args:
            handler: Async function to call when events are emitted

        Returns:
            Unsubscribe function
        """
        self._handlers.append(handler)
        logger.debug(f"Event handler subscribed, total handlers: {len(self._handlers)}")

        def unsubscribe() -> None:
            if handler in self._handlers:
                self._handlers.remove(handler)
                logger.debug(f"Event handler unsubscribed, total handlers: {len(self._handlers)}")

        return unsubscribe

    async def emit(self, event: ForgeEvent) -> None:
        """Emit an event to all subscribers.

        Args:
            event: The event to emit
        """
        # Add to history
        self._event_history.append(event)
        if len(self._event_history) > self._max_history:
            self._event_history = self._event_history[-self._max_history:]

        # Broadcast to all handlers
        if self._handlers:
            await asyncio.gather(
                *[self._safe_call(handler, event) for handler in self._handlers],
                return_exceptions=True,
            )

    async def _safe_call(self, handler: EventHandler, event: ForgeEvent) -> None:
        """Safely call a handler, catching exceptions."""
        try:
            await handler(event)
        except Exception as e:
            logger.error(f"Event handler error: {e}")

    def get_recent_events(
        self,
        limit: int = 100,
        event_types: list[EventType] | None = None,
        source: str | None = None,
    ) -> list[ForgeEvent]:
        """Get recent events from history.

        Args:
            limit: Maximum events to return
            event_types: Optional filter by event types
            source: Optional filter by source

        Returns:
            List of recent events, newest first
        """
        events = self._event_history

        if event_types:
            events = [e for e in events if e.event_type in event_types]

        if source:
            events = [e for e in events if e.source == source]

        return list(reversed(events[-limit:]))

    def clear_history(self) -> None:
        """Clear event history."""
        self._event_history = []


# Global event bus instance
_event_bus: EventBus | None = None


def get_event_bus() -> EventBus:
    """Get the global event bus instance."""
    global _event_bus
    if _event_bus is None:
        _event_bus = EventBus.get_instance()
    return _event_bus


async def emit_event(
    event_type: EventType,
    data: dict[str, Any],
    source: str = "api",
    duration_ms: float | None = None,
    request_id: str | None = None,
    user_id: str | None = None,
) -> None:
    """Convenience function to emit an event.

    Args:
        event_type: Type of event
        data: Event data payload
        source: Event source
        duration_ms: Optional duration for timed events
        request_id: Optional request ID for correlation
        user_id: Optional user ID
    """
    event = ForgeEvent(
        event_type=event_type,
        data=data,
        source=source,
        duration_ms=duration_ms,
        request_id=request_id,
        user_id=user_id,
    )
    await get_event_bus().emit(event)


# Context manager for timing events
class EventTimer:
    """Context manager for timing and emitting events.

    Usage:
        async with EventTimer(EventType.MCP_TOOL_CALLED, {"tool": "search"}) as timer:
            result = await do_work()
            timer.set_result({"count": len(result)})
    """

    def __init__(
        self,
        start_event: EventType,
        start_data: dict[str, Any],
        end_event: EventType | None = None,
        source: str = "api",
        request_id: str | None = None,
        user_id: str | None = None,
    ):
        self.start_event = start_event
        self.start_data = start_data
        self.end_event = end_event
        self.source = source
        self.request_id = request_id
        self.user_id = user_id
        self.start_time: float = 0
        self.result_data: dict[str, Any] = {}

    async def __aenter__(self) -> "EventTimer":
        import time

        self.start_time = time.time()
        await emit_event(
            self.start_event,
            self.start_data,
            source=self.source,
            request_id=self.request_id,
            user_id=self.user_id,
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        import time

        duration_ms = (time.time() - self.start_time) * 1000

        if self.end_event:
            end_data = {**self.start_data, **self.result_data}
            if exc_type:
                end_data["error"] = str(exc_val)

            await emit_event(
                self.end_event,
                end_data,
                source=self.source,
                duration_ms=duration_ms,
                request_id=self.request_id,
                user_id=self.user_id,
            )

    def set_result(self, data: dict[str, Any]) -> None:
        """Set result data to include in end event."""
        self.result_data = data
