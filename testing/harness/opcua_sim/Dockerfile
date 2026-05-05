FROM python:3.11-slim

WORKDIR /app

# Install asyncua only — keep the image small.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py ./

# Default OPC-UA endpoint port.
EXPOSE 4840

# Healthcheck: probe the TCP port using only stdlib (asyncua's own client would
# work but adds startup cost). Container is unhealthy until the server binds.
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=10 \
    CMD python -c "import socket,sys; s=socket.socket(); s.settimeout(2); \
        sys.exit(0) if s.connect_ex(('127.0.0.1',4840))==0 else sys.exit(1)"

ENTRYPOINT ["python", "-u", "server.py"]
