"""Password hashing and verification using argon2.

Provides secure password hashing with argon2id, the recommended
algorithm for password storage.
"""

import argon2

# Module-level hasher instance with secure defaults
_hasher = argon2.PasswordHasher()


def hash_password(plain: str) -> str:
    """Hash a plaintext password with argon2.

    Args:
        plain: The plaintext password to hash.

    Returns:
        The argon2 hash string.
    """
    return _hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against an argon2 hash.

    Args:
        plain: The plaintext password to verify.
        hashed: The stored argon2 hash.

    Returns:
        True if the password matches, False otherwise.
    """
    try:
        return _hasher.verify(hashed, plain)
    except (argon2.exceptions.VerifyMismatchError, argon2.exceptions.InvalidHashError):
        return False
    except Exception:
        return False


def needs_rehash(hashed: str) -> bool:
    """Check if a hash needs to be rehashed due to updated parameters.

    Args:
        hashed: The stored argon2 hash.

    Returns:
        True if the hash should be re-computed with current parameters.
    """
    return _hasher.check_needs_rehash(hashed)
