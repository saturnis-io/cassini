"""Password policy enforcement and history management.

Shared helpers used by change-password, reset-password, and admin user
management endpoints to enforce PasswordPolicy complexity rules and
password history constraints.
"""

from __future__ import annotations

import json
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.core.auth.passwords import verify_password
from cassini.db.models.signature import PasswordPolicy
from cassini.db.models.user import User

# Sensible defaults when no PasswordPolicy row exists in the database.
# These prevent fresh installs from having zero password security.
DEFAULT_MIN_LENGTH = 8
DEFAULT_MAX_FAILED_ATTEMPTS = 5
DEFAULT_LOCKOUT_DURATION_MINUTES = 15


async def load_password_policy(
    session: AsyncSession,
) -> Optional[PasswordPolicy]:
    """Load the first PasswordPolicy row, or None."""
    result = await session.execute(select(PasswordPolicy).limit(1))
    return result.scalar_one_or_none()


def enforce_password_complexity(
    password: str,
    policy: Optional[PasswordPolicy],
) -> None:
    """Validate password against policy complexity rules.

    Always enforces a minimum length of 8 characters. If a PasswordPolicy
    exists, its stricter rules take precedence.

    Raises HTTPException(400) on violation.
    """
    # Baseline minimum regardless of policy
    min_length = DEFAULT_MIN_LENGTH
    if policy and policy.min_password_length and policy.min_password_length > min_length:
        min_length = policy.min_password_length

    if len(password) < min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {min_length} characters",
        )

    if policy is None:
        return

    if policy.require_uppercase and not any(c.isupper() for c in password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one uppercase letter",
        )
    if policy.require_lowercase and not any(c.islower() for c in password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one lowercase letter",
        )
    if policy.require_digit and not any(c.isdigit() for c in password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one digit",
        )
    if policy.require_special and not any(not c.isalnum() for c in password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one special character",
        )


def check_password_history(
    new_password: str,
    user: User,
    policy: Optional[PasswordPolicy],
) -> None:
    """Check new password against the user's password history.

    Raises HTTPException(400) if the password was recently used.
    """
    if policy is None or policy.password_history_count <= 0:
        return

    history = _load_history(user)
    for old_hash in history:
        if verify_password(new_password, old_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password was used recently. Please choose a different password.",
            )


def update_password_history(
    old_hashed_password: str,
    user: User,
    policy: Optional[PasswordPolicy],
) -> None:
    """Prepend the old hashed password to user's history and trim.

    Call AFTER successfully changing the password (but before commit).
    """
    if policy is None or policy.password_history_count <= 0:
        return

    history = _load_history(user)
    history.insert(0, old_hashed_password)
    # Trim to configured limit
    history = history[: policy.password_history_count]
    user.password_history = json.dumps(history)


def _load_history(user: User) -> list[str]:
    """Parse the JSON password_history column into a list of hashes."""
    if not user.password_history:
        return []
    try:
        parsed = json.loads(user.password_history)
        if isinstance(parsed, list):
            return [h for h in parsed if isinstance(h, str)]
    except (json.JSONDecodeError, TypeError):
        pass
    return []
