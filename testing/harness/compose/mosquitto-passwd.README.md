# Mosquitto password file

The Mosquitto broker config (`mosquitto.conf`) sets `allow_anonymous false`
and `password_file /mosquitto/config/passwd`. The `passwd` file is mounted
into the container alongside the conf.

The file is intentionally **not** checked in. It must be generated locally
(or by CI) before bringing the harness up. Mosquitto will refuse to start
otherwise.

## Default test credentials

| Username  | Password   | Role                     |
|-----------|------------|--------------------------|
| cassini   | cassini    | Cassini backend ingestor |
| publisher | publisher  | Sample data publishers   |

## Generating the file

The `mosquitto_passwd` tool is bundled inside the official `eclipse-mosquitto`
image. The simplest method is to run it once via `docker run` and write the
output into this directory:

```bash
cd apps/cassini/testing/harness/compose
touch passwd

docker run --rm -i -v "$PWD:/work" eclipse-mosquitto:2 \
  sh -c 'mosquitto_passwd -b -c /work/passwd cassini cassini && \
         mosquitto_passwd -b /work/passwd publisher publisher'
```

The `passwd` file is git-ignored; do not commit it.

## TLS certificates

The TLS listener on 8883 expects three files in `compose/certs/`:

- `ca.crt` — CA certificate
- `server.crt` — server certificate signed by the CA
- `server.key` — server private key

Generate a self-signed pair for local testing:

```bash
mkdir -p certs
cd certs
openssl req -new -x509 -days 365 -nodes -newkey rsa:4096 \
  -keyout ca.key -out ca.crt \
  -subj "/CN=cassini-test-ca"
openssl req -new -nodes -newkey rsa:4096 \
  -keyout server.key -out server.csr \
  -subj "/CN=cassini-mosquitto"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 365
rm server.csr ca.key ca.srl
```

For CI/automated testing, drive this from a setup script — the generated
files are git-ignored.
