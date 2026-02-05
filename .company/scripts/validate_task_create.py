#!/usr/bin/env python3
"""Validate TaskCreate tool calls.

This script is called as a pre-tool hook to validate task creation.
For now, it simply passes through all task creations.
"""

import sys

# No validation currently - allow all task creates
sys.exit(0)
