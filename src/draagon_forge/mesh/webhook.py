"""
Webhook handler for git push events.

Provides a FastAPI router for handling GitHub webhooks that trigger
mesh extraction when repositories are updated.
"""

from __future__ import annotations

import hashlib
import hmac
from typing import Optional

import structlog
from fastapi import APIRouter, Header, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel

from .registry import ProjectRegistry, ProjectStatus

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Global registry instance (set by application)
_registry: Optional[ProjectRegistry] = None


def set_registry(registry: ProjectRegistry) -> None:
    """Set the global registry instance."""
    global _registry
    _registry = registry


class WebhookPayload(BaseModel):
    """GitHub webhook push payload (subset of fields)."""

    ref: str
    after: str
    repository: dict
    commits: list[dict] = []


def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    """
    Verify GitHub webhook signature.

    Args:
        payload: Raw request body
        signature: X-Hub-Signature-256 header value
        secret: Webhook secret

    Returns:
        True if signature is valid
    """
    if not signature.startswith("sha256="):
        return False

    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(f"sha256={expected}", signature)


@router.post("/github/{project_id}")
async def handle_github_webhook(
    project_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_hub_signature_256: Optional[str] = Header(None),
    x_github_event: Optional[str] = Header(None),
):
    """
    Handle GitHub webhook push events.

    Args:
        project_id: Project ID from URL path
        request: FastAPI request
        background_tasks: Background task queue
        x_hub_signature_256: GitHub signature header
        x_github_event: GitHub event type header
    """
    if _registry is None:
        raise HTTPException(status_code=503, detail="Registry not initialized")

    # Get project
    project = _registry.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    # Read raw body for signature verification
    body = await request.body()

    # Verify signature if secret is configured
    if project.webhook_secret:
        if not x_hub_signature_256:
            raise HTTPException(status_code=401, detail="Missing signature")

        if not verify_signature(body, x_hub_signature_256, project.webhook_secret):
            raise HTTPException(status_code=401, detail="Invalid signature")

    # Only handle push events
    if x_github_event != "push":
        logger.info("Ignoring non-push event", event=x_github_event)
        return {"status": "ignored", "reason": f"Event type '{x_github_event}' not handled"}

    # Parse payload
    try:
        payload = WebhookPayload.model_validate_json(body)
    except Exception as e:
        logger.error("Failed to parse webhook payload", error=str(e))
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Check if this is the tracked branch
    branch = payload.ref.replace("refs/heads/", "")
    if branch != project.branch:
        logger.info(
            "Ignoring push to non-tracked branch",
            pushed=branch,
            tracked=project.branch,
        )
        return {"status": "ignored", "reason": f"Branch '{branch}' not tracked"}

    # Log the push
    repo_name = payload.repository.get("full_name", "unknown")
    commit_count = len(payload.commits)
    logger.info(
        "Received push webhook",
        project_id=project_id,
        repo=repo_name,
        branch=branch,
        commits=commit_count,
        head=payload.after[:8],
    )

    # Queue extraction in background
    background_tasks.add_task(trigger_extraction, project_id)

    return {
        "status": "queued",
        "project_id": project_id,
        "branch": branch,
        "commits": commit_count,
    }


async def trigger_extraction(project_id: str) -> None:
    """
    Trigger extraction for a project (background task).

    Args:
        project_id: Project ID
    """
    if _registry is None:
        logger.error("Registry not initialized")
        return

    logger.info("Starting webhook-triggered extraction", project_id=project_id)

    try:
        result = await _registry.extract(project_id)
        if result["success"]:
            logger.info(
                "Webhook extraction complete",
                project_id=project_id,
                nodes=result["statistics"]["total_nodes"],
            )
        else:
            logger.error(
                "Webhook extraction failed",
                project_id=project_id,
                error=result.get("error"),
            )
    except Exception as e:
        logger.error(
            "Webhook extraction error",
            project_id=project_id,
            error=str(e),
        )


@router.get("/status")
async def webhook_status():
    """Get webhook handler status."""
    if _registry is None:
        return {"status": "not_initialized"}

    projects = _registry.list()
    webhook_enabled = [p for p in projects if p.webhook_secret]

    return {
        "status": "ready",
        "total_projects": len(projects),
        "webhook_enabled": len(webhook_enabled),
    }
