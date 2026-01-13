"""
Claude Code Configuration Reader

Reads Claude Code account information from ~/.claude.json
"""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class ClaudeAccountInfo:
    """Claude Code account information."""

    authenticated: bool = False
    auth_type: str = "none"  # oauth, api_key, none
    email: str | None = None
    display_name: str | None = None
    organization_name: str | None = None
    organization_role: str | None = None
    has_subscription: bool = False
    has_extra_usage: bool = False
    num_startups: int = 0
    prompt_count: int = 0
    member_since: str | None = None

    # Additional fields from claude.json
    account_uuid: str | None = None
    workspace_uuid: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "authenticated": self.authenticated,
            "authType": self.auth_type,
            "email": self.email,
            "displayName": self.display_name,
            "organizationName": self.organization_name,
            "organizationRole": self.organization_role,
            "hasSubscription": self.has_subscription,
            "hasExtraUsage": self.has_extra_usage,
            "numStartups": self.num_startups,
            "promptCount": self.prompt_count,
            "memberSince": self.member_since,
            "accountUuid": self.account_uuid,
            "workspaceUuid": self.workspace_uuid,
        }


def get_claude_config_path() -> Path:
    """Get the path to Claude Code configuration file."""
    # Claude Code stores config in ~/.claude.json
    return Path.home() / ".claude.json"


def read_claude_config() -> ClaudeAccountInfo:
    """
    Read Claude Code account information from ~/.claude.json

    Returns:
        ClaudeAccountInfo with account details, or default empty info if not found
    """
    config_path = get_claude_config_path()

    if not config_path.exists():
        return ClaudeAccountInfo()

    try:
        with open(config_path, "r") as f:
            data = json.load(f)

        # Extract account information
        # Claude Code config structure may vary, handle different formats

        # Check for OAuth/authentication
        oauth_account = data.get("oauthAccount") or data.get("oauth_account") or {}

        # Determine auth type
        auth_type = "none"
        authenticated = False

        if oauth_account:
            auth_type = "oauth"
            authenticated = True
        elif data.get("apiKey") or data.get("api_key"):
            auth_type = "api_key"
            authenticated = True

        # Extract user details
        email_address = (
            oauth_account.get("emailAddress") or
            oauth_account.get("email_address") or
            oauth_account.get("email") or
            data.get("email")
        )

        display_name = (
            oauth_account.get("fullName") or
            oauth_account.get("full_name") or
            oauth_account.get("displayName") or
            oauth_account.get("display_name") or
            data.get("displayName")
        )

        # Organization info
        organization = oauth_account.get("primaryOrganization") or oauth_account.get("organization") or {}
        org_name = organization.get("name") or organization.get("displayName")
        org_role = organization.get("role") or organization.get("memberRole")

        # Subscription info
        subscription = oauth_account.get("subscription") or data.get("subscription") or {}
        has_subscription = bool(
            subscription.get("isActive") or
            subscription.get("is_active") or
            oauth_account.get("hasActiveSubscription") or
            subscription
        )
        has_extra_usage = bool(
            subscription.get("hasExtraUsage") or
            subscription.get("has_extra_usage")
        )

        # Usage stats
        num_startups = data.get("numStartups") or data.get("num_startups") or 0
        prompt_count = data.get("statsig", {}).get("totalPrompts") or data.get("promptCount") or 0

        # Member since
        member_since = oauth_account.get("createdAt") or oauth_account.get("created_at")

        # UUIDs
        account_uuid = oauth_account.get("accountUuid") or oauth_account.get("account_uuid")
        workspace_uuid = data.get("workspaceUuid") or data.get("workspace_uuid")

        return ClaudeAccountInfo(
            authenticated=authenticated,
            auth_type=auth_type,
            email=email_address,
            display_name=display_name,
            organization_name=org_name,
            organization_role=org_role,
            has_subscription=has_subscription,
            has_extra_usage=has_extra_usage,
            num_startups=num_startups,
            prompt_count=prompt_count,
            member_since=member_since,
            account_uuid=account_uuid,
            workspace_uuid=workspace_uuid,
        )

    except (json.JSONDecodeError, KeyError, TypeError) as e:
        print(f"Warning: Failed to parse Claude config: {e}")
        return ClaudeAccountInfo()
    except Exception as e:
        print(f"Warning: Error reading Claude config: {e}")
        return ClaudeAccountInfo()


def get_claude_account_summary() -> str:
    """Get a human-readable summary of the Claude account."""
    info = read_claude_config()

    if not info.authenticated:
        return "Not authenticated"

    parts = []
    if info.display_name:
        parts.append(info.display_name)
    if info.email:
        parts.append(f"({info.email})")
    if info.organization_name:
        parts.append(f"@ {info.organization_name}")
    if info.has_subscription:
        parts.append("[Pro]")

    return " ".join(parts) if parts else "Authenticated"
