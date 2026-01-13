"""Project context resource."""

import json
from draagon_forge.mcp.config import config


def get_project_settings() -> str:
    """Get project settings resource.

    Returns:
        JSON-formatted project settings
    """
    settings = {
        "name": config.project_name,
        "storage_backend": config.storage_backend,
        "project_root": str(config.project_root) if config.project_root else None,
        "min_conviction_threshold": config.min_conviction_threshold,
        "block_threshold": config.block_threshold,
        "feedback_deltas": {
            "helpful": config.feedback_helpful_delta,
            "not_helpful": config.feedback_not_helpful_delta,
            "misleading": config.feedback_misleading_delta,
            "outdated": config.feedback_outdated_delta,
        },
        "adjust_deltas": {
            "reinforce": config.adjust_reinforce_delta,
            "weaken": config.adjust_weaken_delta,
        },
    }
    return json.dumps(settings, indent=2)
