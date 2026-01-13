"""Workflow prompts for common operations."""


def code_review_workflow() -> str:
    """Standard prompt for code review tasks.

    Returns:
        Prompt template for code review
    """
    return """Review the provided code changes with these considerations:

1. Does it follow project principles?
2. Are there potential architectural issues?
3. Is test coverage adequate?
4. Does it match the established patterns?
5. Are there security concerns?

Format your response as XML:
<review>
    <principles>
        <followed>List of principles followed</followed>
        <violated>List of principles violated (if any)</violated>
    </principles>
    <architecture>
        <issues>Architectural concerns (if any)</issues>
        <recommendations>Suggested improvements</recommendations>
    </architecture>
    <testing>
        <coverage>Assessment of test coverage</coverage>
        <gaps>Areas needing tests</gaps>
    </testing>
    <security>
        <issues>Security concerns (if any)</issues>
    </security>
    <overall>
        <recommendation>approve | request_changes | comment</recommendation>
        <reasoning>Explanation of recommendation</reasoning>
    </overall>
</review>
"""


def semantic_analysis_workflow() -> str:
    """Prompt for semantic analysis using LLM.

    Returns:
        Prompt template for semantic analysis
    """
    return """Analyze the following content semantically (do NOT use regex or keyword matching):

{content}

Consider:
1. What is the intent?
2. What are the key concepts?
3. What patterns are evident?
4. Are there any semantic conflicts with established principles?

Respond in XML format:
<analysis>
    <intent>Primary intent of the content</intent>
    <concepts>
        <concept>Key concept 1</concept>
        <concept>Key concept 2</concept>
    </concepts>
    <patterns>
        <pattern>Detected pattern 1</pattern>
        <pattern>Detected pattern 2</pattern>
    </patterns>
    <conflicts>
        <conflict>Any conflicts with principles (if found)</conflict>
    </conflicts>
    <confidence>0.0-1.0</confidence>
</analysis>
"""


def pattern_extraction_workflow() -> str:
    """Prompt for extracting patterns from code.

    Returns:
        Prompt template for pattern extraction
    """
    return """Extract recurring patterns from the following code changes:

{changes}

Identify:
1. Repeated coding patterns
2. Design patterns being used
3. Anti-patterns to avoid
4. Architectural decisions

Respond in XML format:
<patterns>
    <pattern>
        <name>Pattern name</name>
        <description>What the pattern does</description>
        <examples>
            <example>Code example 1</example>
            <example>Code example 2</example>
        </examples>
        <conviction>0.0-1.0 (how confident you are this is a real pattern)</conviction>
    </pattern>
</patterns>
"""
