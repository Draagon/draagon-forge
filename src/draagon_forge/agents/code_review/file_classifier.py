"""
File Classifier

Classifies files by priority for review triage.
Uses heuristics to identify critical, important, minor, and noise files.
"""

import re
from pathlib import Path

from .models import FileClassification, FileDiff


class FileClassifier:
    """Classify files for review prioritization."""

    # Critical paths - always review
    CRITICAL_PATHS = [
        r"(^|/)auth/",
        r"(^|/)authentication/",
        r"(^|/)crypto/",
        r"(^|/)security/",
        r"(^|/)secrets/",
        r"(^|/)password",
        r"(^|/)credentials",
        r"(^|/)oauth",
        r"(^|/)jwt",
        r"(^|/)api[-_]?key",
    ]

    # Critical files by name
    CRITICAL_FILES = [
        r"\.env(\..+)?$",
        r"config\.(py|ts|js|json|yaml|yml)$",
        r"settings\.(py|ts|js|json|yaml|yml)$",
        r"secrets\.(py|ts|js|json|yaml|yml)$",
        r"credentials\.(py|ts|js|json|yaml|yml)$",
        r"package\.json$",
        r"pyproject\.toml$",
        r"requirements\.txt$",
        r"Gemfile$",
        r"Cargo\.toml$",
        r"go\.mod$",
        r"docker-compose\.ya?ml$",
        r"Dockerfile$",
    ]

    # Noise patterns - skip these
    NOISE_PATTERNS = [
        r"\.lock$",  # Lock files
        r"lock\.json$",
        r"\.min\.(js|css)$",  # Minified files
        r"(^|/)dist/",  # Build output
        r"(^|/)build/",
        r"(^|/)node_modules/",
        r"(^|/)vendor/",
        r"(^|/)\.git/",
        r"(^|/)__pycache__/",
        r"\.pyc$",
        r"(^|/)coverage/",
        r"\.map$",  # Source maps
        r"(^|/)\.next/",
        r"(^|/)\.nuxt/",
    ]

    # Test patterns - lower priority unless significant
    TEST_PATTERNS = [
        r"(^|/)tests?/",
        r"(^|/)__tests__/",
        r"\.test\.(ts|tsx|js|jsx)$",
        r"\.spec\.(ts|tsx|js|jsx)$",
        r"_test\.(py|go)$",
        r"test_.*\.py$",
    ]

    # Documentation patterns
    DOC_PATTERNS = [
        r"\.md$",
        r"\.rst$",
        r"\.txt$",
        r"(^|/)docs?/",
        r"README",
        r"CHANGELOG",
        r"LICENSE",
    ]

    # API/business logic patterns - important
    IMPORTANT_PATTERNS = [
        r"(^|/)api/",
        r"(^|/)routes/",
        r"(^|/)endpoints/",
        r"(^|/)handlers/",
        r"(^|/)controllers/",
        r"(^|/)services/",
        r"(^|/)models/",
        r"(^|/)schemas/",
        r"(^|/)database/",
        r"(^|/)migrations?/",
    ]

    def __init__(
        self,
        critical_threshold: int = 0,  # Any change to critical is reviewed
        important_threshold: int = 50,  # Changes >50 lines are important
        minor_threshold: int = 20,  # Changes >20 lines get attention
    ):
        """Initialize classifier with thresholds."""
        self.critical_threshold = critical_threshold
        self.important_threshold = important_threshold
        self.minor_threshold = minor_threshold

        # Compile regex patterns
        self._critical_paths = [re.compile(p, re.I) for p in self.CRITICAL_PATHS]
        self._critical_files = [re.compile(p, re.I) for p in self.CRITICAL_FILES]
        self._noise = [re.compile(p, re.I) for p in self.NOISE_PATTERNS]
        self._tests = [re.compile(p, re.I) for p in self.TEST_PATTERNS]
        self._docs = [re.compile(p, re.I) for p in self.DOC_PATTERNS]
        self._important = [re.compile(p, re.I) for p in self.IMPORTANT_PATTERNS]

    def classify(self, file_diff: FileDiff) -> FileClassification:
        """Classify a single file."""
        path = file_diff.path
        lines_changed = file_diff.total_lines_changed

        # Binary files are noise
        if file_diff.is_binary:
            return FileClassification.NOISE

        # Check noise patterns first (skip these)
        for pattern in self._noise:
            if pattern.search(path):
                return FileClassification.NOISE

        # Critical paths
        for pattern in self._critical_paths:
            if pattern.search(path):
                return FileClassification.CRITICAL

        # Critical files
        for pattern in self._critical_files:
            if pattern.search(path):
                return FileClassification.CRITICAL

        # Tests - minor unless large
        for pattern in self._tests:
            if pattern.search(path):
                if lines_changed > self.important_threshold:
                    return FileClassification.IMPORTANT
                return FileClassification.MINOR

        # Docs - minor unless large
        for pattern in self._docs:
            if pattern.search(path):
                if lines_changed > self.important_threshold:
                    return FileClassification.IMPORTANT
                return FileClassification.MINOR

        # Important patterns (API, services, etc.)
        for pattern in self._important:
            if pattern.search(path):
                return FileClassification.IMPORTANT

        # Fall back to size-based classification
        if lines_changed > self.important_threshold:
            return FileClassification.IMPORTANT
        elif lines_changed > self.minor_threshold:
            return FileClassification.MINOR
        else:
            # Small changes to non-critical files
            return FileClassification.MINOR

    def classify_all(
        self, diffs: list[FileDiff]
    ) -> dict[FileClassification, list[FileDiff]]:
        """Classify all files and group by classification."""
        result: dict[FileClassification, list[FileDiff]] = {
            FileClassification.CRITICAL: [],
            FileClassification.IMPORTANT: [],
            FileClassification.MINOR: [],
            FileClassification.NOISE: [],
        }

        for diff in diffs:
            classification = self.classify(diff)
            result[classification].append(diff)

        return result

    def prioritize(
        self, diffs: list[FileDiff], max_files: int = 20
    ) -> tuple[list[FileDiff], list[FileDiff]]:
        """
        Prioritize files for review.

        Returns:
            Tuple of (files_to_review, files_skipped)
        """
        classified = self.classify_all(diffs)

        to_review: list[FileDiff] = []
        skipped: list[FileDiff] = []

        # Always include critical files
        to_review.extend(classified[FileClassification.CRITICAL])

        # Add important files up to limit
        remaining = max_files - len(to_review)
        important = classified[FileClassification.IMPORTANT]

        # Sort important by lines changed (descending)
        important.sort(key=lambda d: d.total_lines_changed, reverse=True)

        to_review.extend(important[:remaining])
        skipped.extend(important[remaining:])

        # Minor files only if we have room
        remaining = max_files - len(to_review)
        if remaining > 0:
            minor = classified[FileClassification.MINOR]
            minor.sort(key=lambda d: d.total_lines_changed, reverse=True)
            to_review.extend(minor[:remaining])
            skipped.extend(minor[remaining:])
        else:
            skipped.extend(classified[FileClassification.MINOR])

        # Noise is always skipped
        skipped.extend(classified[FileClassification.NOISE])

        return to_review, skipped

    def is_formatting_only(self, diff: FileDiff) -> bool:
        """Check if a diff contains only formatting changes."""
        # Simple heuristic: if all changes are whitespace-related
        content = diff.raw_diff

        # Look for actual code changes (not just whitespace)
        code_changes = 0
        whitespace_changes = 0

        for line in content.split("\n"):
            if line.startswith("+") and not line.startswith("+++"):
                stripped = line[1:].strip()
                if stripped:
                    code_changes += 1
                else:
                    whitespace_changes += 1
            elif line.startswith("-") and not line.startswith("---"):
                stripped = line[1:].strip()
                if stripped:
                    code_changes += 1
                else:
                    whitespace_changes += 1

        # If >80% of changes are whitespace, it's likely formatting
        total = code_changes + whitespace_changes
        if total == 0:
            return True
        return whitespace_changes / total > 0.8
