"""Cross-system contract test: feature entitlement strings must match between backend and website.

The backend (licensing.py) and website (webhooks/stripe/route.ts) both define
feature entitlement lists. If they drift, has_feature() silently fails for
features customers paid for.

This test reads the TypeScript source file and extracts the entitlement arrays
to compare against the Python sets.
"""
import re
from pathlib import Path

import pytest

from cassini.core.licensing import PRO_FEATURES, ENTERPRISE_FEATURES


def _extract_ts_array(content: str, var_name: str) -> set[str]:
    """Extract a TypeScript string array from source code."""
    # Match: const VAR_NAME = [ ... ]  or  const VAR_NAME = [\n...\n]
    pattern = rf'const\s+{var_name}\s*=\s*\[(.*?)\]'
    match = re.search(pattern, content, re.DOTALL)
    if not match:
        return set()
    body = match.group(1)
    # Check for ...SPREAD syntax: const VAR = [...OTHER, "extra"]
    spread_match = re.search(r'\.\.\.(\w+)', body)
    if spread_match:
        spread_var = spread_match.group(1)
        base = _extract_ts_array(content, spread_var)
        extra = set(re.findall(r'"([^"]+)"', body))
        return base | extra
    items = re.findall(r'"([^"]+)"', body)
    return set(items)


WEBHOOK_FILE = Path(__file__).resolve().parent.parent.parent.parent.parent / \
    "website" / "src" / "app" / "api" / "webhooks" / "stripe" / "route.ts"


@pytest.mark.skipif(
    not WEBHOOK_FILE.exists(),
    reason="Website webhook file not found (running outside monorepo)"
)
class TestFeatureStringParity:
    """Verify backend and website feature strings match exactly."""

    @pytest.fixture(autouse=True)
    def load_webhook(self):
        self.ts_content = WEBHOOK_FILE.read_text()
        self.ts_pro = _extract_ts_array(self.ts_content, "PRO_ENTITLEMENTS")
        self.ts_enterprise = _extract_ts_array(self.ts_content, "ENTERPRISE_ENTITLEMENTS")

    def test_pro_features_match(self):
        """PRO_FEATURES (Python) must equal PRO_ENTITLEMENTS (TypeScript)."""
        missing_in_ts = PRO_FEATURES - self.ts_pro
        extra_in_ts = self.ts_pro - PRO_FEATURES
        assert not missing_in_ts, f"In Python PRO_FEATURES but missing from TS: {missing_in_ts}"
        assert not extra_in_ts, f"In TS PRO_ENTITLEMENTS but missing from Python: {extra_in_ts}"

    def test_enterprise_features_superset_of_pro(self):
        """ENTERPRISE_ENTITLEMENTS must contain all PRO_ENTITLEMENTS."""
        missing = self.ts_pro - self.ts_enterprise
        assert not missing, f"Pro features missing from Enterprise: {missing}"

    def test_enterprise_exclusive_features_match(self):
        """Enterprise-only features must match between Python and TypeScript."""
        py_enterprise_only = ENTERPRISE_FEATURES  # Python ENTERPRISE_FEATURES is enterprise-ONLY
        ts_enterprise_only = self.ts_enterprise - self.ts_pro
        missing_in_ts = py_enterprise_only - ts_enterprise_only
        extra_in_ts = ts_enterprise_only - py_enterprise_only
        assert not missing_in_ts, f"In Python ENTERPRISE_FEATURES but missing from TS enterprise-only: {missing_in_ts}"
        assert not extra_in_ts, f"In TS enterprise-only but missing from Python: {extra_in_ts}"

    def test_no_unknown_features_in_webhook(self):
        """All webhook features must be recognized by the backend."""
        all_known = PRO_FEATURES | ENTERPRISE_FEATURES
        all_webhook = self.ts_enterprise  # Enterprise contains all
        unknown = all_webhook - all_known
        assert not unknown, f"Webhook has features unknown to backend: {unknown}"
