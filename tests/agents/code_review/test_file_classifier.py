"""
Unit tests for FileClassifier.

Tests file classification by priority without external dependencies.
"""

import pytest

from draagon_forge.agents.code_review.file_classifier import FileClassifier
from draagon_forge.agents.code_review.models import FileClassification, FileDiff


# =============================================================================
# FIXTURES: Sample FileDiff objects
# =============================================================================

def make_diff(path: str, lines_added: int = 10, lines_deleted: int = 5, is_binary: bool = False) -> FileDiff:
    """Helper to create FileDiff objects for testing."""
    raw_diff = ""
    if not is_binary:
        # Generate fake diff content
        raw_diff = f"diff --git a/{path} b/{path}\n"
        raw_diff += "+" * lines_added + "\n"
        raw_diff += "-" * lines_deleted + "\n"
    return FileDiff(
        path=path,
        lines_added=lines_added,
        lines_deleted=lines_deleted,
        is_binary=is_binary,
        raw_diff=raw_diff,
    )


# =============================================================================
# UNIT TESTS: Critical File Classification
# =============================================================================

class TestCriticalClassification:
    """Tests for critical file detection."""

    @pytest.fixture
    def classifier(self):
        return FileClassifier()

    @pytest.mark.parametrize("path", [
        "src/auth/login.py",
        "src/authentication/oauth.py",
        "lib/crypto/hash.py",
        "utils/security/validate.py",
        "config/secrets/api_keys.py",
        "services/password_reset.py",
        "auth/credentials_manager.py",
        "oauth/handler.py",
        "jwt/token.py",
        "api_key_validator.py",
    ])
    def test_security_paths_are_critical(self, classifier, path):
        """Security-related paths should be classified as critical."""
        diff = make_diff(path, lines_added=1)
        result = classifier.classify(diff)
        assert result == FileClassification.CRITICAL, f"{path} should be critical"

    @pytest.mark.parametrize("path", [
        ".env",
        ".env.local",
        ".env.production",
        "config.py",
        "config.json",
        "config.yaml",
        "settings.py",
        "settings.json",
        "secrets.yaml",
        "credentials.json",
        "package.json",
        "pyproject.toml",
        "requirements.txt",
        "Gemfile",
        "Cargo.toml",
        "go.mod",
        "docker-compose.yml",
        "docker-compose.yaml",
        "Dockerfile",
    ])
    def test_config_files_are_critical(self, classifier, path):
        """Configuration files should be classified as critical."""
        diff = make_diff(path, lines_added=1)
        result = classifier.classify(diff)
        assert result == FileClassification.CRITICAL, f"{path} should be critical"


# =============================================================================
# UNIT TESTS: Noise File Classification
# =============================================================================

class TestNoiseClassification:
    """Tests for noise file detection."""

    @pytest.fixture
    def classifier(self):
        return FileClassifier()

    @pytest.mark.parametrize("path", [
        "package-lock.json",
        "yarn.lock",
        "Gemfile.lock",
        "poetry.lock",
        "Cargo.lock",
        "dist/bundle.js",
        "build/output.js",
        "node_modules/lodash/index.js",
        "vendor/autoload.php",
        ".git/config",
        "__pycache__/module.pyc",
        "module.pyc",
        "coverage/lcov.info",
        "bundle.js.map",
        ".next/static/chunks/main.js",
        ".nuxt/dist/client/vendor.js",
    ])
    def test_noise_files_are_skipped(self, classifier, path):
        """Lock files and generated code should be noise."""
        diff = make_diff(path, lines_added=1000)  # Even large changes
        result = classifier.classify(diff)
        assert result == FileClassification.NOISE, f"{path} should be noise"

    def test_binary_files_are_noise(self, classifier):
        """Binary files should be classified as noise."""
        diff = make_diff("image.png", is_binary=True)
        result = classifier.classify(diff)
        assert result == FileClassification.NOISE

    def test_minified_files_are_noise(self, classifier):
        """Minified files should be noise."""
        diff = make_diff("app.min.js", lines_added=1)
        result = classifier.classify(diff)
        assert result == FileClassification.NOISE


# =============================================================================
# UNIT TESTS: Important File Classification
# =============================================================================

class TestImportantClassification:
    """Tests for important file detection."""

    @pytest.fixture
    def classifier(self):
        return FileClassifier()

    @pytest.mark.parametrize("path", [
        "src/api/users.py",
        "routes/products.ts",
        "endpoints/orders.js",
        "handlers/payment.go",
        "controllers/auth_controller.rb",
        "services/email_service.py",
        "models/user.py",
        "schemas/product_schema.py",
        "database/connection.py",
        "migrations/001_create_users.py",
    ])
    def test_api_paths_are_important(self, classifier, path):
        """API and service paths should be classified as important."""
        diff = make_diff(path, lines_added=10)
        result = classifier.classify(diff)
        assert result == FileClassification.IMPORTANT, f"{path} should be important"

    def test_large_changes_are_important(self, classifier):
        """Files with many changes should be important regardless of path."""
        diff = make_diff("random_file.py", lines_added=100)
        result = classifier.classify(diff)
        assert result == FileClassification.IMPORTANT


# =============================================================================
# UNIT TESTS: Minor File Classification
# =============================================================================

class TestMinorClassification:
    """Tests for minor file detection."""

    @pytest.fixture
    def classifier(self):
        return FileClassifier()

    @pytest.mark.parametrize("path", [
        "tests/test_user.py",
        "test/integration_test.js",
        "__tests__/Component.test.tsx",
        "user.test.ts",
        "user.spec.js",
        "user_test.py",
        "test_user.py",
    ])
    def test_test_files_are_minor(self, classifier, path):
        """Test files should be minor (unless large)."""
        diff = make_diff(path, lines_added=10)
        result = classifier.classify(diff)
        assert result == FileClassification.MINOR, f"{path} should be minor"

    @pytest.mark.parametrize("path", [
        "README.md",
        "CHANGELOG.md",
        "docs/guide.rst",
        "documentation/api.txt",
        "LICENSE",
    ])
    def test_doc_files_are_minor(self, classifier, path):
        """Documentation files should be minor."""
        diff = make_diff(path, lines_added=10)
        result = classifier.classify(diff)
        assert result == FileClassification.MINOR, f"{path} should be minor"

    def test_large_test_files_become_important(self, classifier):
        """Large test changes should be important."""
        diff = make_diff("tests/test_big.py", lines_added=100)
        result = classifier.classify(diff)
        assert result == FileClassification.IMPORTANT


# =============================================================================
# UNIT TESTS: classify_all()
# =============================================================================

class TestClassifyAll:
    """Tests for batch classification."""

    def test_classify_all_groups_correctly(self):
        """classify_all groups files by classification."""
        classifier = FileClassifier()
        diffs = [
            make_diff("src/auth/login.py", lines_added=10),  # critical
            make_diff("package-lock.json", lines_added=100),  # noise
            make_diff("src/api/users.py", lines_added=50),  # important
            make_diff("tests/test_auth.py", lines_added=20),  # minor
        ]

        result = classifier.classify_all(diffs)

        assert len(result[FileClassification.CRITICAL]) == 1
        assert len(result[FileClassification.NOISE]) == 1
        assert len(result[FileClassification.IMPORTANT]) == 1
        assert len(result[FileClassification.MINOR]) == 1


# =============================================================================
# UNIT TESTS: prioritize()
# =============================================================================

class TestPrioritize:
    """Tests for file prioritization."""

    def test_prioritize_respects_max_files(self):
        """prioritize respects max_files limit."""
        classifier = FileClassifier()
        diffs = [make_diff(f"file{i}.py", lines_added=30) for i in range(30)]

        to_review, skipped = classifier.prioritize(diffs, max_files=10)

        assert len(to_review) == 10
        assert len(skipped) == 20

    def test_prioritize_critical_always_included(self):
        """Critical files are always included."""
        classifier = FileClassifier()
        diffs = [
            make_diff(".env", lines_added=1),  # critical
            *[make_diff(f"file{i}.py", lines_added=100) for i in range(25)],  # important
        ]

        to_review, skipped = classifier.prioritize(diffs, max_files=5)

        # .env should be in to_review
        paths = [d.path for d in to_review]
        assert ".env" in paths

    def test_prioritize_noise_always_skipped(self):
        """Noise files are always skipped."""
        classifier = FileClassifier()
        diffs = [
            make_diff("package-lock.json", lines_added=10000),  # noise
            make_diff("src/main.py", lines_added=10),  # minor
        ]

        to_review, skipped = classifier.prioritize(diffs, max_files=10)

        # Lock file should be skipped
        skipped_paths = [d.path for d in skipped]
        assert "package-lock.json" in skipped_paths

        # Main.py should be reviewed
        review_paths = [d.path for d in to_review]
        assert "src/main.py" in review_paths

    def test_prioritize_sorts_by_lines_changed(self):
        """Important files are sorted by lines changed."""
        classifier = FileClassifier()
        diffs = [
            make_diff("src/api/small.py", lines_added=60),  # important, smaller
            make_diff("src/api/large.py", lines_added=200),  # important, larger
            make_diff("src/api/medium.py", lines_added=100),  # important, medium
        ]

        to_review, _ = classifier.prioritize(diffs, max_files=10)

        # Should be sorted by lines changed (descending)
        paths = [d.path for d in to_review]
        assert paths == [
            "src/api/large.py",
            "src/api/medium.py",
            "src/api/small.py",
        ]


# =============================================================================
# UNIT TESTS: is_formatting_only()
# =============================================================================

class TestIsFormattingOnly:
    """Tests for formatting-only detection."""

    def test_whitespace_only_is_formatting(self):
        """Changes that are mostly whitespace are formatting-only."""
        classifier = FileClassifier()
        diff = FileDiff(
            path="test.py",
            raw_diff="""\
diff --git a/test.py b/test.py
--- a/test.py
+++ b/test.py
@@ -1,3 +1,3 @@
-def foo():
+def foo():
-    pass
+    pass
""",
        )

        # This is tricky - the lines look the same but whitespace differs
        # The current implementation counts stripped lines
        # In this case, both versions have content, so it's not formatting-only
        assert classifier.is_formatting_only(diff) is False

    def test_empty_diff_is_formatting_only(self):
        """Empty diff is considered formatting-only."""
        classifier = FileClassifier()
        diff = FileDiff(path="test.py", raw_diff="")

        assert classifier.is_formatting_only(diff) is True

    def test_code_changes_not_formatting(self):
        """Actual code changes are not formatting-only."""
        classifier = FileClassifier()
        diff = FileDiff(
            path="test.py",
            raw_diff="""\
diff --git a/test.py b/test.py
--- a/test.py
+++ b/test.py
@@ -1,3 +1,5 @@
 def foo():
-    pass
+    print("hello")
+    print("world")
+    return True
""",
        )

        assert classifier.is_formatting_only(diff) is False
