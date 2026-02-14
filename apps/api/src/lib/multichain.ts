import { logger } from './logger.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * Multichain JSON-RPC Client
 * ═══════════════════════════════════════════════════════════════
 *
 * Connects to a private Multichain node for the permissioned
 * ledger layer. Publishes hashes to a data stream and retrieves
 * them for verification.
 *
 * Multichain API docs: https://www.multichain.com/developers/json-rpc-api/
 * ═══════════════════════════════════════════════════════════════
 */

const config = {
  host: process.env.MULTICHAIN_RPC_HOST || '127.0.0.1',
  port: parseInt(process.env.MULTICHAIN_RPC_PORT || '4798'),
  user: process.env.MULTICHAIN_RPC_USER || 'multichainrpc',
  password: process.env.MULTICHAIN_RPC_PASSWORD || '',
  chainName: process.env.MULTICHAIN_CHAIN_NAME || 'dxerchain',
  streamName: process.env.MULTICHAIN_STREAM_NAME || 'dxer-anchors',
};

let requestId = 0;

const DEFAULT_RPC_TIMEOUT_MS = 15_000;
const HEALTH_CHECK_TIMEOUT_MS = 4_000;

/**
 * Make a JSON-RPC call to Multichain.
 * @param timeoutMs - Abort after this many ms (default 15s). Use lower value for health checks.
 */
async function rpcCall(method: string, params: unknown[] = [], timeoutMs: number = DEFAULT_RPC_TIMEOUT_MS): Promise<any> {
  const id = ++requestId;
  const url = `http://${config.host}:${config.port}`;
  const auth = Buffer.from(`${config.user}:${config.password}`).toString('base64');

  logger.debug({ method, params, url }, 'Multichain RPC call');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify({
        jsonrpc: '1.0',
        id,
        method,
        params,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      logger.error({ status: response.status, body: text }, 'Multichain RPC HTTP error');
      throw new Error(`Multichain RPC HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();

    if (data.error) {
      logger.error({ error: data.error }, 'Multichain RPC error');
      throw new Error(`Multichain RPC error: ${data.error.message} (code: ${data.error.code})`);
    }

    return data.result;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      logger.warn({ method, timeoutMs }, 'Multichain RPC timeout');
      throw new Error(`Multichain RPC timeout after ${timeoutMs}ms`);
    }
    throw err;
  }
}

/**
 * Check if the Multichain node is reachable.
 */
export async function multichainHealthCheck(): Promise<{ connected: boolean; chainName: string; blocks: number }> {
  try {
    const info = await rpcCall('getinfo', [], HEALTH_CHECK_TIMEOUT_MS);
    return {
      connected: true,
      chainName: info.chainname,
      blocks: info.blocks,
    };
  } catch (err: any) {
    logger.warn({ error: err.message }, 'Multichain health check failed');
    return { connected: false, chainName: config.chainName, blocks: 0 };
  }
}

/**
 * Ensure the anchor stream exists. Creates it if not found.
 */
export async function ensureStream(): Promise<void> {
  try {
    // Check if stream already exists
    const streams = await rpcCall('liststreams', [config.streamName]);
    if (streams && streams.length > 0) {
      logger.info({ stream: config.streamName }, 'Multichain stream exists');
      return;
    }
  } catch {
    // Stream doesn't exist, create it
  }

  try {
    await rpcCall('create', ['stream', config.streamName, true]);
    logger.info({ stream: config.streamName }, 'Multichain stream created');
  } catch (err: any) {
    // "Entity with this name already exists" is OK
    if (err.message.includes('already exists')) {
      logger.info({ stream: config.streamName }, 'Multichain stream already exists');
    } else {
      throw err;
    }
  }

  // Subscribe to the stream so we can query it
  try {
    await rpcCall('subscribe', [config.streamName]);
    logger.info({ stream: config.streamName }, 'Subscribed to Multichain stream');
  } catch {
    // Already subscribed is fine
  }
}

/**
 * Publish a hash to the Multichain stream.
 *
 * @param key - Unique key for the stream item (e.g., "expense:uuid")
 * @param dataHex - Hex-encoded data to store (the hash)
 * @param metadata - JSON metadata to store alongside
 * @returns Multichain transaction ID
 */
export async function publishToStream(
  key: string,
  dataHex: string,
  metadata?: Record<string, unknown>,
): Promise<string> {
  // Multichain publish expects hex-encoded data
  // We'll store a JSON object with the hash and metadata
  const payload = {
    hash: dataHex,
    timestamp: new Date().toISOString(),
    ...metadata,
  };

  const payloadHex = Buffer.from(JSON.stringify(payload)).toString('hex');

  logger.info({ stream: config.streamName, key, dataHex }, 'Publishing to Multichain stream');

  const txid = await rpcCall('publish', [config.streamName, key, payloadHex]);

  logger.info({ txid, key }, 'Published to Multichain stream');

  return txid;
}

/**
 * Retrieve stream items by key.
 *
 * @param key - The key to look up
 * @returns Array of stream items with decoded data
 */
export async function getStreamItemsByKey(key: string): Promise<Array<{
  txid: string;
  data: Record<string, unknown>;
  blocktime: number;
  confirmations: number;
}>> {
  logger.debug({ stream: config.streamName, key }, 'Querying Multichain stream');

  const items = await rpcCall('liststreamkeyitems', [config.streamName, key]);

  return items.map((item: any) => {
    let decodedData: Record<string, unknown> = {};
    try {
      if (item.data && typeof item.data === 'string') {
        decodedData = JSON.parse(Buffer.from(item.data, 'hex').toString('utf-8'));
      } else if (item.data && item.data.json) {
        decodedData = item.data.json;
      } else if (item.data && item.data.text) {
        decodedData = JSON.parse(item.data.text);
      }
    } catch {
      decodedData = { raw: item.data };
    }

    return {
      txid: item.txid,
      data: decodedData,
      blocktime: item.blocktime || 0,
      confirmations: item.confirmations || 0,
    };
  });
}

/**
 * Get a specific transaction's details.
 */
export async function getTransaction(txid: string): Promise<{
  txid: string;
  confirmations: number;
  blocktime: number;
  valid: boolean;
} | null> {
  try {
    const tx = await rpcCall('getrawtransaction', [txid, 1]);
    return {
      txid: tx.txid,
      confirmations: tx.confirmations || 0,
      blocktime: tx.blocktime || 0,
      valid: true,
    };
  } catch (err: any) {
    logger.warn({ txid, error: err.message }, 'Multichain transaction not found');
    return null;
  }
}

/**
 * Get the hex data stored in a specific Multichain transaction.
 */
export async function getTransactionData(txid: string): Promise<string | null> {
  try {
    const tx = await rpcCall('gettxoutdata', [txid, 0]);
    return tx;
  } catch (err: any) {
    logger.warn({ txid, error: err.message }, 'Could not retrieve Multichain tx data');
    return null;
  }
}

export { config as multichainConfig };
