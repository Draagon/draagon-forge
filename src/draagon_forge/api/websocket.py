"""WebSocket endpoint for real-time event streaming.

Provides a WebSocket connection for the Inspector UI to receive
real-time events from MCP tools, memory operations, and agent decisions.
"""

import asyncio
import logging
from typing import Any
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from draagon_forge.api.events import (
    EventType,
    ForgeEvent,
    get_event_bus,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections for event broadcasting."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self._unsubscribe: callable | None = None

    async def connect(self, websocket: WebSocket) -> None:
        """Accept a new WebSocket connection."""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected, total connections: {len(self.active_connections)}")

        # Subscribe to event bus if this is the first connection
        if len(self.active_connections) == 1:
            self._unsubscribe = get_event_bus().subscribe(self._broadcast_event)
            logger.info("Subscribed to event bus for broadcasting")

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket disconnected, total connections: {len(self.active_connections)}")

        # Unsubscribe from event bus if no connections remain
        if len(self.active_connections) == 0 and self._unsubscribe:
            self._unsubscribe()
            self._unsubscribe = None
            logger.info("Unsubscribed from event bus")

    async def _broadcast_event(self, event: ForgeEvent) -> None:
        """Broadcast an event to all connected clients."""
        if not self.active_connections:
            return

        message = event.to_json()
        disconnected: list[WebSocket] = []

        for connection in self.active_connections:
            try:
                if connection.client_state == WebSocketState.CONNECTED:
                    await connection.send_text(message)
            except Exception as e:
                logger.warning(f"Failed to send to WebSocket: {e}")
                disconnected.append(connection)

        # Clean up disconnected connections
        for conn in disconnected:
            self.disconnect(conn)

    async def send_personal_message(self, message: str, websocket: WebSocket) -> None:
        """Send a message to a specific WebSocket."""
        try:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_text(message)
        except Exception as e:
            logger.warning(f"Failed to send personal message: {e}")


# Global connection manager
manager = ConnectionManager()


@router.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    """WebSocket endpoint for real-time event streaming.

    Clients connect here to receive events as they occur.

    Messages from client:
    - {"type": "subscribe", "events": ["mcp.*", "memory.*"]} - Filter events
    - {"type": "get_history", "limit": 100} - Get recent events
    - {"type": "ping"} - Keep-alive ping

    Messages to client:
    - Event objects as they occur
    - {"type": "pong"} - Response to ping
    - {"type": "history", "events": [...]} - Response to get_history
    """
    await manager.connect(websocket)

    # Send connection confirmation
    await websocket.send_text(json.dumps({
        "type": "connected",
        "message": "Connected to Forge event stream",
    }))

    # Optional event type filter for this connection
    event_filter: set[str] | None = None

    try:
        while True:
            # Receive messages from client
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=60.0,  # 60 second timeout for ping/pong
                )
            except asyncio.TimeoutError:
                # Send ping to check connection
                await websocket.send_text(json.dumps({"type": "ping"}))
                continue

            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON",
                }))
                continue

            msg_type = message.get("type")

            if msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

            elif msg_type == "pong":
                # Client responded to our ping, connection is alive
                pass

            elif msg_type == "subscribe":
                # Set event filter for this connection
                events = message.get("events", [])
                if events:
                    event_filter = set(events)
                    await websocket.send_text(json.dumps({
                        "type": "subscribed",
                        "events": list(event_filter),
                    }))
                else:
                    event_filter = None
                    await websocket.send_text(json.dumps({
                        "type": "subscribed",
                        "events": "all",
                    }))

            elif msg_type == "get_history":
                # Return recent events
                limit = message.get("limit", 100)
                event_types = message.get("event_types")
                source = message.get("source")

                # Parse event types if provided
                types_filter = None
                if event_types:
                    types_filter = []
                    for et in event_types:
                        try:
                            types_filter.append(EventType(et))
                        except ValueError:
                            pass

                events = get_event_bus().get_recent_events(
                    limit=limit,
                    event_types=types_filter,
                    source=source,
                )

                await websocket.send_text(json.dumps({
                    "type": "history",
                    "events": [e.to_dict() for e in events],
                    "count": len(events),
                }))

            elif msg_type == "clear_history":
                get_event_bus().clear_history()
                await websocket.send_text(json.dumps({
                    "type": "history_cleared",
                }))

            else:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}",
                }))

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


@router.get("/events/history")
async def get_event_history(
    limit: int = 100,
    source: str | None = None,
    event_type: str | None = None,
) -> dict[str, Any]:
    """Get recent event history via HTTP.

    This is useful for initial page load before WebSocket connects.

    Args:
        limit: Maximum events to return
        source: Filter by source (mcp, api, agent, memory)
        event_type: Filter by event type prefix (e.g., "mcp." or "memory.")

    Returns:
        Recent events
    """
    event_types = None
    if event_type:
        # Filter by prefix match
        event_types = [et for et in EventType if et.value.startswith(event_type)]

    events = get_event_bus().get_recent_events(
        limit=limit,
        event_types=event_types,
        source=source,
    )

    return {
        "events": [e.to_dict() for e in events],
        "count": len(events),
    }


@router.delete("/events/history")
async def clear_event_history() -> dict[str, str]:
    """Clear event history."""
    get_event_bus().clear_history()
    return {"status": "cleared"}
