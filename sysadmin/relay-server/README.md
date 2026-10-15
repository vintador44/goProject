# SysAdmin relay server

This is an independent Go module and server process. It does not import or build the desktop application, and it does not contain the Python agent. Build or run it from this directory, then deploy the resulting binary and TLS files to the VPS. Agents and the desktop app communicate with it over the documented network protocol.

## Start

Set a long random API token and a TLS certificate whose SAN matches the hostname or IP entered in the desktop app:

```sh
export SYSADMIN_RELAY_TOKEN="$(openssl rand -hex 32)"
export SYSADMIN_AGENT_TOKEN="$(openssl rand -hex 32)"
export SYSADMIN_RELAY_TLS_CERT=/etc/letsencrypt/live/relay.example.com/fullchain.pem
export SYSADMIN_RELAY_TLS_KEY=/etc/letsencrypt/live/relay.example.com/privkey.pem
go run .
```

Build a standalone Linux binary with `go build -o sysadmin-relay .`.

Enter `SYSADMIN_RELAY_TOKEN` on the `Remote SysAgent` page and set the same `SYSADMIN_AGENT_TOKEN` on every agent. The client validates the TLS certificate; use a hostname covered by the certificate, or a certificate with the public IP in its IP SAN.

Allow these inbound ports in the VPS firewall:

- TCP `65432` for agent metrics and command polling
- TCP `65434` for agent remote shell callbacks
- TCP `65435` for remote desktop streams
- TCP `65436` for the TLS control API
- UDP `65433` only for LAN discovery; remote agents should use a configured server address instead

Set `SYSADMIN_SERVER_IP` on each agent to the relay's public IP or DNS name before starting it. For example:

```sh
SYSADMIN_SERVER_IP=203.0.113.10 \
SYSADMIN_SERVER_NAME=relay.example.com \
SYSADMIN_USE_TLS=1 \
SYSADMIN_AGENT_TOKEN="$SYSADMIN_AGENT_TOKEN" \
python agent.py
```

On Windows, set the same four environment variables in the agent's launch environment. `SYSADMIN_SERVER_IP` is the VPS address; `SYSADMIN_SERVER_NAME` must match the TLS certificate. Agent connections are outbound, so devices behind NAT can connect to the VPS without port forwarding.
