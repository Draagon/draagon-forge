"""API request and response models."""

from dataclasses import dataclass, field
from typing import Any
import time


@dataclass
class ChatRequest:
    """Simple chat request."""

    message: str
    user_id: str | None = None
    conversation_id: str | None = None
    context: dict[str, Any] | None = None


@dataclass
class ChatResponse:
    """Chat response."""

    response: str
    conversation_id: str | None = None
    beliefs_used: list[str] = field(default_factory=list)
    actions_taken: list[str] = field(default_factory=list)
    confidence: float = 0.8


# OpenAI-compatible models for Open WebUI integration


@dataclass
class OpenAIMessage:
    """OpenAI-compatible message."""

    role: str = "assistant"
    content: str = ""


@dataclass
class OpenAIChoice:
    """OpenAI-compatible choice."""

    index: int = 0
    message: OpenAIMessage = field(default_factory=OpenAIMessage)
    finish_reason: str = "stop"


@dataclass
class OpenAIUsage:
    """OpenAI-compatible usage stats."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


@dataclass
class OpenAIChatRequest:
    """OpenAI-compatible chat completion request."""

    messages: list[dict[str, str]]
    model: str = "forge"
    user: str | None = None
    stream: bool = False

    # Extension fields for Forge
    conversation_id: str | None = None
    context: dict[str, Any] | None = None

    def get_user_query(self) -> str | None:
        """Extract user query from messages."""
        for msg in reversed(self.messages):
            if msg.get("role") == "user":
                return msg.get("content")
        return None

    def get_user_id(self) -> str:
        """Get user ID with fallback."""
        return self.user or "default"


@dataclass
class OpenAIChatResponse:
    """OpenAI-compatible chat completion response."""

    id: str = ""
    object: str = "chat.completion"
    created: int = 0
    model: str = "forge"
    choices: list[OpenAIChoice] = field(default_factory=list)
    usage: OpenAIUsage = field(default_factory=OpenAIUsage)

    def __post_init__(self):
        if not self.id:
            self.id = f"chatcmpl-{int(time.time() * 1000)}"
        if not self.created:
            self.created = int(time.time())
