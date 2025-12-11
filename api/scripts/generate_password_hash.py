#!/usr/bin/env python3
"""
Generate PBKDF2 password hash for DeepWiki user authentication

Usage:
    python api/scripts/generate_password_hash.py your_password

Output format: pbkdf2:sha256:iterations$salt$hash
Example: pbkdf2:sha256:600000$randomsalt123$abc123def456...
"""
import sys
import hashlib
import secrets


def generate_pbkdf2_hash(password: str, iterations: int = 600000) -> str:
    """
    Generate PBKDF2-SHA256 password hash

    Args:
        password: Plain text password
        iterations: Number of iterations (default 600000, OWASP recommendation)

    Returns:
        Hash string in format: pbkdf2:sha256:iterations$salt$hash
    """
    # Generate random salt (16 bytes = 128 bits)
    salt = secrets.token_hex(16)

    # Compute hash
    password_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        iterations
    ).hex()

    # Format: pbkdf2:algorithm:iterations$salt$hash
    return f"pbkdf2:sha256:{iterations}${salt}${password_hash}"


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python generate_password_hash.py <password>")
        print("\nExample:")
        print("  python api/scripts/generate_password_hash.py mySecurePassword123")
        sys.exit(1)

    password = sys.argv[1]

    if len(password) < 8:
        print("Warning: Password should be at least 8 characters long")

    hash_value = generate_pbkdf2_hash(password)

    print("\n" + "="*70)
    print("PBKDF2-SHA256 Password Hash Generated")
    print("="*70)
    print(f"\nPassword: {password}")
    print(f"\nHash (copy this to users.json):")
    print(f"\n  {hash_value}")
    print("\n" + "="*70)
    print("\nAdd this to your users.json file:")
    print("""
{
  "id": "user-uuid-here",
  "username": "your_username",
  "password_hash": "%s",
  "role": "admin",
  "created_at": "2025-01-10T00:00:00Z",
  "updated_at": "2025-01-10T00:00:00Z",
  "disabled": false,
  "metadata": {}
}
""" % hash_value)
    print("="*70)
