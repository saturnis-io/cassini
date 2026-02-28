#!/usr/bin/env python3
"""Internal tool to generate signed Cassini license keys.

NOT shipped with the application. Used by Saturnis to issue licenses.

Usage:
    python tools/generate_license.py generate-keypair --output-dir .
    python tools/generate_license.py generate-license \
        --customer "Acme Manufacturing" \
        --email "quality@acme.com" \
        --tier enterprise \
        --max-plants 20 \
        --days 365 \
        --private-key license_private.pem \
        --output acme.license.key
"""

import argparse
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import jwt
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding, NoEncryption, PrivateFormat, PublicFormat,
    load_pem_private_key,
)


def generate_keypair(output_dir: Path) -> None:
    """Generate a new Ed25519 keypair for license signing."""
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    priv_path = output_dir / "license_private.pem"
    pub_path = output_dir / "license_public.pem"

    priv_path.write_bytes(
        private_key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    )
    pub_path.write_bytes(
        public_key.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    )

    print(f"Private key: {priv_path}")
    print(f"Public key:  {pub_path}")
    print("\nIMPORTANT: Keep private key secret. Embed public key in licensing.py.")


def generate_license(args: argparse.Namespace) -> None:
    """Generate a signed license JWT."""
    private_pem = Path(args.private_key).read_bytes()
    private_key = load_pem_private_key(private_pem, password=None)

    now = datetime.now(timezone.utc)
    claims = {
        "sub": args.customer.lower().replace(" ", "-"),
        "customer_name": args.customer,
        "customer_email": args.email,
        "tier": args.tier,
        "max_plants": args.max_plants,
        "issued_at": now.isoformat(),
        "expires_at": (now + timedelta(days=args.days)).isoformat(),
    }

    token = jwt.encode(claims, private_key, algorithm="EdDSA")

    output = Path(args.output)
    output.write_text(token)
    print(f"License written to: {output}")
    print(f"Customer: {args.customer}")
    print(f"Tier: {args.tier}")
    print(f"Max plants: {args.max_plants}")
    print(f"Expires: {claims['expires_at']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Cassini License Key Generator")
    sub = parser.add_subparsers(dest="command")

    kp = sub.add_parser("generate-keypair", help="Generate Ed25519 keypair")
    kp.add_argument("--output-dir", default=".", help="Directory for key files")

    gl = sub.add_parser("generate-license", help="Generate signed license")
    gl.add_argument("--customer", required=True)
    gl.add_argument("--email", required=True)
    gl.add_argument("--tier", choices=["professional", "enterprise", "enterprise_plus"], required=True)
    gl.add_argument("--max-plants", type=int, default=5)
    gl.add_argument("--days", type=int, default=365)
    gl.add_argument("--private-key", required=True, help="Path to Ed25519 private key PEM")
    gl.add_argument("--output", default="license.key")

    args = parser.parse_args()

    if args.command == "generate-keypair":
        generate_keypair(Path(args.output_dir))
    elif args.command == "generate-license":
        generate_license(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
