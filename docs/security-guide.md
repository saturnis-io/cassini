# Security Guide

> Certificates, encryption, and production hardening for Cassini SPC.

---

## Table of Contents

1. [Understanding TLS](#1-understanding-tls)
2. [HTTPS Setup (Production)](#2-https-setup-production)
3. [MQTT TLS Certificates](#3-mqtt-tls-certificates)
4. [OPC-UA Certificates](#4-opc-ua-certificates)
5. [Encryption at Rest](#5-encryption-at-rest)
6. [JWT Authentication](#6-jwt-authentication)
7. [Production Security Checklist](#7-production-security-checklist)

---

## 1. Understanding TLS

TLS (Transport Layer Security) encrypts data as it travels between two systems. Without TLS, anyone on the network path can read the traffic in plain text -- passwords, measurement values, configuration data, all of it.

### When You Need TLS

- **Always** in production, no exceptions
- **Always** when data crosses the internet or an untrusted network
- **Recommended** even on private networks (defense in depth)
- **Optional** for localhost-only development setups

### The Certificate Trust Chain

TLS uses certificates to prove identity. The chain works like this:

```
Certificate Authority (CA)
    └── signs → Server Certificate
                    └── optionally signs → Client Certificate (for mTLS)
```

1. A **Certificate Authority (CA)** is a trusted entity that issues certificates. Your browser trusts well-known CAs (Let's Encrypt, DigiCert, etc.). Your company may run its own internal CA.
2. A **Server Certificate** proves the server is who it claims to be. When you visit `https://spc.example.com`, the server presents its certificate. Your browser checks that a trusted CA signed it.
3. A **Client Certificate** (optional) proves the client's identity to the server. This is called **mutual TLS (mTLS)** and is common with MQTT brokers in industrial environments.

### Terminology Glossary

| Term | Meaning |
|------|---------|
| **CA** | Certificate Authority -- the trusted entity that signs certificates |
| **PEM** | Privacy Enhanced Mail -- a text format for certificates. Starts with `-----BEGIN CERTIFICATE-----` |
| **TLS** | Transport Layer Security -- the encryption protocol (successor to SSL) |
| **mTLS** | Mutual TLS -- both server and client present certificates to each other |
| **Self-signed** | A certificate signed by itself, not by a CA. Useful for testing, not trusted by browsers by default |
| **HTTPS** | HTTP over TLS -- encrypted web traffic on port 443 |
| **MQTTS** | MQTT over TLS -- encrypted MQTT traffic, typically on port 8883 |

---

## 2. HTTPS Setup (Production)

### Using Docker + Caddy (Recommended)

The simplest path to production HTTPS. Caddy handles certificate management automatically.

```bash
# Set your domain and a strong JWT secret
export CASSINI_DOMAIN=spc.example.com
export JWT_SECRET=$(openssl rand -hex 32)

# Start with HTTPS
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Caddy automatically:

- Obtains Let's Encrypt certificates for public domains
- Generates self-signed certificates for `localhost` or internal hostnames
- Renews certificates before they expire
- Adds security headers (HSTS, X-Frame-Options, X-Content-Type-Options)

#### DNS Setup

Before starting, create a DNS record pointing your domain to your server:

| Record Type | Name | Value |
|-------------|------|-------|
| A | spc.example.com | Your server's public IP address |
| CNAME | spc.example.com | Your server's hostname (alternative) |

#### Verify HTTPS

```bash
curl -v https://spc.example.com/api/v1/health
```

You should see a valid TLS handshake and `{"status": "healthy"}` in the response.

### Internal / Corporate CA Setup

If your organization uses its own Certificate Authority (common in enterprise environments):

1. Obtain a certificate and private key from your IT department
2. Edit the `Caddyfile` to use your certificates:

```caddy
spc.internal.company.com {
    tls /path/to/cert.pem /path/to/key.pem

    reverse_proxy cassini:8000

    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        -Server
    }

    encode gzip
}
```

3. Mount the certificate files into the Caddy container by adding a volume in `docker-compose.prod.yml`:

```yaml
services:
  caddy:
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./certs:/etc/caddy/certs:ro   # your cert.pem and key.pem
      - caddy-data:/data
      - caddy-config:/config
```

4. Update the Caddyfile paths to match the mount point:

```caddy
tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem
```

### Using Nginx (Alternative)

If you prefer Nginx as your reverse proxy, see the [Deployment Guide](deployment.md) for a complete Nginx configuration with TLS.

---

## 3. MQTT TLS Certificates

### When You Need MQTT TLS

- Your MQTT broker requires TLS connections (most cloud brokers do)
- Data travels between the broker and Cassini over an untrusted network
- Your organization's security policy requires encrypted industrial protocols
- You are using the gage bridge across network boundaries

### Getting Certificates

#### From Your MQTT Broker Provider

Most managed MQTT services (HiveMQ Cloud, EMQ X Cloud, AWS IoT Core) provide CA certificates for download. Check your broker's documentation for:

- The CA certificate (usually a `.pem` or `.crt` file)
- Whether client certificates are required (mTLS)

#### From Your IT Department

If your organization runs its own MQTT broker (e.g., Mosquitto on a company server):

1. Ask your IT department for the broker's CA certificate
2. If mTLS is required, request a client certificate and private key signed by the same CA

#### Self-Signed for Testing

Generate a self-signed CA and server certificate for development:

```bash
# Generate a CA key and certificate
openssl genrsa -out ca.key 2048
openssl req -x509 -new -key ca.key -sha256 -days 365 -out ca.crt \
    -subj "/CN=Test MQTT CA"

# Generate a server key and certificate signed by the CA
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr \
    -subj "/CN=mqtt.example.com"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key \
    -CAcreateserial -out server.crt -days 365 -sha256

# For mTLS: generate a client certificate
openssl genrsa -out client.key 2048
openssl req -new -key client.key -out client.csr \
    -subj "/CN=cassini-client"
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key \
    -CAcreateserial -out client.crt -days 365 -sha256
```

### Uploading Certificates to Cassini

1. Navigate to **Connectivity Hub** in the sidebar
2. Click the **MQTT Brokers** tab
3. Click **Edit** on the broker you want to secure (or **Add Broker** for a new one)
4. Toggle **Use TLS** on -- the port auto-suggests 8883
5. Fill in the TLS fields:

| Field | What to paste | Required? |
|-------|---------------|-----------|
| **CA Certificate** | The CA certificate PEM content (starts with `-----BEGIN CERTIFICATE-----`) | Yes, for TLS |
| **Client Certificate** | Your client certificate PEM content | Only for mTLS |
| **Client Private Key** | Your client private key PEM content | Only for mTLS |
| **Skip Verification** | Checkbox -- disables certificate hostname/trust validation | Testing only |

6. Click **Test Connection** to verify TLS works before saving
7. Click **Save**

### The "Skip Verification" Checkbox

This disables certificate trust validation. When checked, Cassini connects to the broker without verifying the CA certificate chain. This is equivalent to `ssl.CERT_NONE` in Python.

**When to use it:**

- Temporary testing with self-signed certificates
- Debugging TLS connection issues

**When NOT to use it:**

- Production deployments (defeats the purpose of TLS)
- Any environment where data integrity matters

### Troubleshooting MQTT TLS

| Problem | Likely Cause | Solution |
|---------|-------------|----------|
| "TLS handshake failed" | Wrong CA certificate | Verify the CA cert matches the one that signed the broker's certificate |
| "Certificate verify failed" | Self-signed cert without "Skip verification" | Upload the correct CA cert, or enable "Skip verification" for testing |
| "Connection refused" on port 8883 | Broker not configured for TLS | Check broker config (e.g., Mosquitto `listener 8883` + `certfile`/`keyfile`) |
| "Hostname mismatch" | Certificate CN does not match broker hostname | Use the exact hostname in the broker URL that matches the certificate |
| Connection works but "Skip verification" is on | Missing or wrong CA cert | Replace with the correct CA certificate, then uncheck "Skip verification" |

---

## 4. OPC-UA Certificates

### OPC-UA Security Modes

OPC-UA has built-in security that is independent of TLS. Every OPC-UA connection can use one of three security modes:

| Mode | Encryption | Signing | Use Case |
|------|-----------|---------|----------|
| **None** | No | No | Development, isolated networks |
| **Sign** | No | Yes | Integrity protection without encryption |
| **SignAndEncrypt** | Yes | Yes | Production (recommended) |

### Application Certificates

Unlike MQTT (which uses generic TLS), OPC-UA uses **application certificates** -- each OPC-UA client and server has its own certificate that identifies the application.

When Cassini connects to an OPC-UA server with security enabled:

1. Cassini presents its client certificate to the server
2. The server checks if Cassini's certificate is in its trust list
3. The server presents its certificate to Cassini
4. Cassini checks if the server's certificate is trusted

### Setting Up OPC-UA Security in Cassini

1. Navigate to **Connectivity Hub** in the sidebar
2. Click the **OPC-UA** tab
3. Click **Edit** on the server you want to secure (or **Add Server**)
4. Set the **Security Policy** to `Basic256Sha256` (recommended)
5. Upload certificates:

| Field | What to upload | Required? |
|-------|---------------|-----------|
| **Client Certificate** | Cassini's application certificate (PEM) | Yes, for security modes other than None |
| **Client Private Key** | Cassini's application private key (PEM) | Yes, for security modes other than None |
| **Server Certificate** | The OPC-UA server's certificate (PEM) | Recommended for trust verification |

6. Click **Save**

### Trust List Management on the OPC-UA Server

After configuring Cassini, you must also add Cassini's client certificate to the OPC-UA server's **trust list**. The exact steps depend on your OPC-UA server software:

- **Kepware**: Configuration > OPC UA > Trusted Clients > Import
- **Ignition**: Gateway > OPC-UA Server Settings > Security > Quarantined Certificates > Trust
- **Prosys**: Certificates > Rejected > Select certificate > Trust
- **open62541 / node-opcua**: Copy the certificate to the server's `trusted/certs/` directory

Many OPC-UA servers auto-quarantine unknown client certificates on the first connection attempt. Connect once, then go to the server's admin interface to move Cassini's certificate from "Rejected" to "Trusted."

---

## 5. Encryption at Rest

### What Cassini Encrypts

Cassini uses Fernet symmetric encryption to protect sensitive data stored in the database:

| Data Type | Example | Encrypted? |
|-----------|---------|-----------|
| MQTT broker passwords | `mqtt_password` | Yes |
| MQTT TLS certificates | CA cert PEM, client cert PEM, client key PEM | Yes |
| OPC-UA passwords | `opcua_password` | Yes |
| OPC-UA TLS certificates | Client cert PEM, client key PEM, server cert PEM | Yes |
| ERP connector auth configs | OAuth tokens, API keys | Yes |
| User passwords | Login credentials | Hashed (Argon2), not reversible |

### The Encryption Key File

Cassini stores its encryption key in a file called `.db_encryption_key` in the backend directory.

- **Auto-generated**: If the file does not exist, Cassini creates one on first startup
- **Format**: A Fernet key (base64-encoded 32-byte key)
- **Location**: `backend/.db_encryption_key` (or `/app/data/.db_encryption_key` in Docker)

### Backing Up the Key

The encryption key is critical. If you lose it, **all encrypted data in the database becomes unreadable** -- broker passwords, certificates, ERP credentials.

```bash
# Copy the key to a secure backup location
cp /opt/cassini/.db_encryption_key /secure-backup/cassini-encryption-key.bak

# Restrict permissions on both copies
chmod 600 /opt/cassini/.db_encryption_key
chmod 600 /secure-backup/cassini-encryption-key.bak
```

Store the backup in a secure location:

- A hardware security module (HSM) or secrets manager (HashiCorp Vault, AWS Secrets Manager)
- An encrypted USB drive stored in a safe
- Your organization's key management system

### Key Rotation

To rotate the encryption key, you must re-encrypt all existing data:

1. Generate a new Fernet key
2. Decrypt all encrypted fields using the old key
3. Re-encrypt using the new key
4. Replace the `.db_encryption_key` file with the new key

There is no built-in key rotation command at this time. Plan key rotation carefully and test in a staging environment first.

### Important Warnings

- **Never commit** the `.db_encryption_key` file to version control
- **Never share** the encryption key via email or chat
- The encryption key is **separate** from the JWT secret -- rotating one does not affect the other
- If the encryption key is lost, you must re-enter all broker passwords, certificates, and ERP credentials manually

---

## 6. JWT Authentication

### What JWTs Are

JSON Web Tokens (JWTs) are the mechanism Cassini uses for API authentication. When a user logs in, the server issues two tokens:

| Token | Lifetime | Storage | Purpose |
|-------|----------|---------|---------|
| **Access token** | 15 minutes | Browser memory | Authenticates API requests |
| **Refresh token** | 7 days | httpOnly cookie (path `/api/v1/auth`) | Obtains new access tokens silently |

### The JWT Secret

The JWT secret is the cryptographic key used to sign tokens. Anyone with this key can forge valid tokens.

**Configuration:**

- **File**: `.jwt_secret` in the backend directory (auto-generated if not set)
- **Environment variable**: `CASSINI_JWT_SECRET` (takes precedence over the file)

```bash
# Generate a strong JWT secret
openssl rand -hex 64

# Set it in your environment
export CASSINI_JWT_SECRET=<your-generated-secret>
```

### Rotating the JWT Secret

Changing the JWT secret **invalidates all existing tokens immediately**. Every logged-in user will be forced to log in again.

1. Generate a new secret: `openssl rand -hex 64`
2. Update the `CASSINI_JWT_SECRET` environment variable (or `.jwt_secret` file)
3. Restart Cassini

This is the correct action if you suspect the JWT secret has been compromised.

### Security Notes

- Always set `CASSINI_JWT_SECRET` to a strong, unique value in production
- Set `CASSINI_COOKIE_SECURE=true` in production (requires HTTPS) so the refresh cookie is only sent over encrypted connections
- The JWT secret is **independent** of the database encryption key -- rotating one does not affect the other

---

## 7. Production Security Checklist

Verify each item before going live. Items marked "Critical" must not be skipped.

### Authentication and Secrets

- [ ] **Critical**: `CASSINI_JWT_SECRET` is set to a unique, random value (at least 64 characters)
- [ ] **Critical**: `CASSINI_ADMIN_PASSWORD` is changed from any default value
- [ ] `CASSINI_COOKIE_SECURE=true` is set (requires HTTPS)
- [ ] The `.env` file is not committed to version control
- [ ] The `.env` file has restricted permissions (`chmod 600`)
- [ ] The `.db_encryption_key` file is backed up securely and has restricted permissions (`chmod 600`)
- [ ] Database credentials are not hardcoded in source code

### Network and Transport

- [ ] **Critical**: HTTPS is enforced (HTTP redirects to HTTPS)
- [ ] TLS certificates are valid and set to auto-renew (Let's Encrypt or corporate CA)
- [ ] WebSocket endpoint is behind the same TLS termination as the API
- [ ] `CASSINI_CORS_ORIGINS` lists only your actual frontend domain(s)
- [ ] Firewall rules restrict database access to the app server only
- [ ] MQTT broker connections use TLS when crossing untrusted networks
- [ ] OPC-UA connections use `Basic256Sha256` security policy when crossing untrusted networks
- [ ] The "Skip TLS verification" checkbox is unchecked for all production brokers

### Application Configuration

- [ ] `CASSINI_SANDBOX=false` (disables dev tools)
- [ ] `CASSINI_DEV_MODE=false` (enables enterprise enforcement)
- [ ] API documentation endpoints (`/docs`, `/redoc`, `/openapi.json`) are not exposed externally
- [ ] The system service user has minimal permissions (no shell, no sudo)

### Data Protection

- [ ] PostgreSQL is used (not SQLite) for production workloads
- [ ] Database backups are configured, scheduled, and tested
- [ ] The `.db_encryption_key` is stored separately from the database backup
- [ ] Audit logging is enabled and logs are retained per your organization's policy

### Monitoring

- [ ] A health check is configured against `/api/v1/health`
- [ ] Log collection is configured (structlog JSON format recommended)
- [ ] TLS certificate expiry alerts are in place
- [ ] MQTT/OPC-UA disconnection alerts are configured

---

## Cross-References

- [Getting Started](getting-started.md) -- Development setup and first run
- [Deployment Guide](deployment.md) -- Production deployment with Docker, PostgreSQL, and HTTPS
- [Connectivity Guide](connectivity-guide.md) -- MQTT, OPC-UA, and gage bridge setup
- [Gage Bridge Setup Guide](gage-bridge-setup.md) -- RS-232/USB gage integration
