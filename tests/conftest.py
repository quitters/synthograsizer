"""Shared pytest fixtures and path setup for the synthograsizer-suite test suite.

The backend package is imported as `backend.*` (absolute imports), so we
ensure the project root is on sys.path before tests run. This lets tests
execute from any working directory without an editable install.
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
