"""Forge API Server.

FastAPI server providing HTTP endpoints for the Forge chat agent.
Runs independently and can be called by VS Code extension, Open WebUI, etc.

Usage:
    python -m draagon_forge.api.server

    # Or with uvicorn directly:
    uvicorn draagon_forge.api.server:app --host 0.0.0.0 --port 8765
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from draagon_forge.api.routes import router
from draagon_forge.mcp.config import config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    # Startup
    logger.info("Starting Forge API Server...")
    logger.info(f"User: {config.user_id}")
    logger.info(f"LLM: {config.llm_provider}/{config.llm_model}")

    # Initialize memory backend
    try:
        from draagon_forge.mcp.memory import initialize_memory

        await initialize_memory()
        logger.info("Memory backend initialized")
    except Exception as e:
        logger.error(f"Failed to initialize memory: {e}")
        # Continue anyway - will fail on first request

    # Pre-warm the agent (optional, comment out for faster startup)
    try:
        from draagon_forge.api.routes import get_forge_agent

        await get_forge_agent()
        logger.info("Forge agent pre-warmed")
    except Exception as e:
        logger.warning(f"Agent pre-warm failed (will retry on first request): {e}")

    logger.info("Forge API Server started successfully")

    yield

    # Shutdown
    logger.info("Shutting down Forge API Server...")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Draagon Forge API",
        description="AI Development Companion - Chat API for intelligent coding assistance",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Add CORS middleware for browser/extension access
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # VS Code extension, Open WebUI, etc.
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include API routes
    app.include_router(router)

    return app


# Create the app instance
app = create_app()


def run(
    host: str = "0.0.0.0",
    port: int = 8765,
    reload: bool = False,
) -> None:
    """Run the Forge API server.

    Args:
        host: Host to bind to
        port: Port to listen on
        reload: Enable auto-reload for development
    """
    logger.info(f"Starting server on http://{host}:{port}")
    uvicorn.run(
        "draagon_forge.api.server:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info",
    )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Forge API Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")

    args = parser.parse_args()
    run(host=args.host, port=args.port, reload=args.reload)
