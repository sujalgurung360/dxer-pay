#!/bin/bash
set -e

CHAIN_NAME="${MULTICHAIN_CHAIN_NAME:-dxerchain}"
RPC_PORT="${MULTICHAIN_RPC_PORT:-4798}"
RPC_USER="${MULTICHAIN_RPC_USER:-multichainrpc}"
RPC_PASSWORD="${MULTICHAIN_RPC_PASSWORD:-dxer123}"
RPC_ALLOW_IP="${MULTICHAIN_RPC_ALLOW_IP:-0.0.0.0/0.0.0.0}"

CHAIN_DIR="/root/.multichain/${CHAIN_NAME}"

if [ ! -d "${CHAIN_DIR}" ]; then
  echo "Creating chain: ${CHAIN_NAME} with RPC port ${RPC_PORT}"
  multichain-util create "${CHAIN_NAME}" -default-rpc-port="${RPC_PORT}"
fi

# Ensure RPC credentials exist (create or overwrite)
mkdir -p "${CHAIN_DIR}"
cat > "${CHAIN_DIR}/multichain.conf" << EOF
rpcuser=${RPC_USER}
rpcpassword=${RPC_PASSWORD}
rpcallowip=${RPC_ALLOW_IP}
EOF

echo "Starting multichaind ${CHAIN_NAME}..."
multichaind "${CHAIN_NAME}" -daemon

# Keep container running
while true; do sleep 60; done
