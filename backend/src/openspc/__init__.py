"""
Compatibility shim: openspc -> cassini.

Old Alembic migrations import from openspc.db.models.*.
This package redirects those imports to the renamed cassini package.
Remove this shim in a future major version.
"""
import importlib
import sys


class _CassiniRedirector:
    """Redirects openspc.* imports to cassini.*"""

    def find_module(self, fullname, path=None):
        if fullname == "openspc" or fullname.startswith("openspc."):
            return self
        return None

    def load_module(self, fullname):
        if fullname in sys.modules:
            return sys.modules[fullname]
        cassini_name = fullname.replace("openspc", "cassini", 1)
        mod = importlib.import_module(cassini_name)
        sys.modules[fullname] = mod
        return mod


# Install the redirector on first import of this package
sys.meta_path.insert(0, _CassiniRedirector())
