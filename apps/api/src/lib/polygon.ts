import { ethers } from 'ethers';
import { logger } from './logger.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * Polygon Blockchain Client
 * ═══════════════════════════════════════════════════════════════
 *
 * Connects to Polygon (Amoy testnet or mainnet) using ethers.js.
 * Submits hashes as transaction calldata for immutable on-chain anchoring.
 *
 * Explorer: https://amoy.polygonscan.com
 * ═══════════════════════════════════════════════════════════════
 */

const config = {
  network: process.env.POLYGON_NETWORK || 'amoy',
  chainId: parseInt(process.env.POLYGON_CHAIN_ID || '80002'),
  rpcUrl: process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology',
  privateKey: process.env.POLYGON_PRIVATE_KEY || '',
  walletAddress: process.env.POLYGON_WALLET_ADDRESS || '',
  explorerUrl: process.env.POLYGON_EXPLORER_URL || 'https://amoy.polygonscan.com',
};

let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;

/**
 * Initialize the Polygon provider and wallet.
 */
function getProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(config.rpcUrl, {
      name: config.network,
      chainId: config.chainId,
    });
    logger.info({ network: config.network, rpc: config.rpcUrl }, 'Polygon provider initialized');
  }
  return provider;
}

function getWallet(): ethers.Wallet {
  if (!wallet) {
    if (!config.privateKey) {
      throw new Error('POLYGON_PRIVATE_KEY not configured');
    }
    // Ensure the private key is properly formatted
    const pk = config.privateKey.startsWith('0x') ? config.privateKey : `0x${config.privateKey}`;
    wallet = new ethers.Wallet(pk, getProvider());
    logger.info({ address: wallet.address }, 'Polygon wallet initialized');
  }
  return wallet;
}

const HEALTH_CHECK_TIMEOUT_MS = 5_000;

/**
 * Check Polygon connection health.
 * Uses a short timeout so slow RPC does not block the API.
 */
export async function polygonHealthCheck(): Promise<{
  connected: boolean;
  network: string;
  blockNumber: number;
  balance: string;
  walletAddress: string;
}> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Polygon health check timeout')), HEALTH_CHECK_TIMEOUT_MS),
  );

  try {
    const p = getProvider();
    const w = getWallet();
    const [blockNumber, balance] = await Promise.race([
      Promise.all([
        p.getBlockNumber(),
        p.getBalance(w.address),
      ]),
      timeoutPromise,
    ]);

    return {
      connected: true,
      network: config.network,
      blockNumber,
      balance: ethers.formatEther(balance) + ' POL',
      walletAddress: w.address,
    };
  } catch (err: any) {
    logger.warn({ error: err.message }, 'Polygon health check failed');
    return {
      connected: false,
      network: config.network,
      blockNumber: 0,
      balance: '0 POL',
      walletAddress: config.walletAddress,
    };
  }
}

/**
 * Submit a hash to Polygon as transaction calldata.
 *
 * The hash is embedded in the `data` field of a self-transfer (0-value tx).
 * This makes it permanently stored on Polygon, viewable on PolygonScan.
 *
 * @param hash - The SHA-256 hash to anchor (hex string, no 0x prefix)
 * @param entityType - Type of entity being anchored
 * @param entityId - ID of the entity
 * @param orgPrivateKey - Optional: org-specific private key for per-org signing
 * @returns Polygon transaction hash, block number, and explorer URL
 */
export async function submitHashToPolygon(
  hash: string,
  entityType: string,
  entityId: string,
  orgPrivateKey?: string,
): Promise<{
  polygonTxHash: string;
  blockNumber: number;
  gasUsed: string;
  explorerUrl: string;
  dataHex: string;
  signerAddress: string;
}> {
  // Use org-specific wallet if provided, otherwise fall back to master wallet
  let w: ethers.Wallet;
  if (orgPrivateKey) {
    const pk = orgPrivateKey.startsWith('0x') ? orgPrivateKey : `0x${orgPrivateKey}`;
    w = new ethers.Wallet(pk, getProvider());
    logger.info({ address: w.address }, 'Polygon: using org-specific wallet');
  } else {
    w = getWallet();
  }

  // Build calldata: 0x + "DXER" prefix (4458455200) + hash
  // The DXER prefix makes it easy to identify our anchoring txs on-chain
  const prefix = Buffer.from('DXER').toString('hex'); // 44584552
  const entityMarker = Buffer.from(`|${entityType}|${entityId}|`).toString('hex');
  const dataHex = `0x${prefix}${hash}${entityMarker}`;

  logger.info({
    hash,
    entityType,
    entityId,
    to: w.address,
    dataLength: dataHex.length,
  }, 'Polygon: submitting hash on-chain');

  // Send a 0-value transaction to ourselves with the hash as data
  const tx = await w.sendTransaction({
    to: w.address,  // Self-transfer (0 value, data only)
    value: 0,
    data: dataHex,
  });

  logger.info({ txHash: tx.hash }, 'Polygon: transaction submitted, waiting for confirmation');

  // Wait for 1 confirmation
  const receipt = await tx.wait(1);

  if (!receipt) {
    throw new Error('Transaction receipt is null - transaction may have been dropped');
  }

  const result = {
    polygonTxHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    explorerUrl: `${config.explorerUrl}/tx/${receipt.hash}`,
    dataHex,
    signerAddress: w.address,
  };

  logger.info(result, 'Polygon: hash anchored on-chain');

  return result;
}

/**
 * Fund an org wallet with a small amount of POL for gas fees.
 * Called automatically when a new organization signs up.
 *
 * @param orgWalletAddress - The new org's wallet address to fund
 * @param amountInPol - Amount of POL to send (default: 0.01 for testnet)
 */
export async function fundOrgWallet(
  orgWalletAddress: string,
  amountInPol: string = '0.01',
): Promise<{ txHash: string; amount: string } | null> {
  try {
    const masterWallet = getWallet();
    const balance = await getProvider().getBalance(masterWallet.address);

    const amountWei = ethers.parseEther(amountInPol);
    if (balance < amountWei * 2n) {
      logger.warn({
        masterBalance: ethers.formatEther(balance),
        requested: amountInPol,
      }, 'Polygon: master wallet low on funds, skipping org funding');
      return null;
    }

    logger.info({
      from: masterWallet.address,
      to: orgWalletAddress,
      amount: amountInPol,
    }, 'Polygon: funding new org wallet');

    const tx = await masterWallet.sendTransaction({
      to: orgWalletAddress,
      value: amountWei,
    });

    const receipt = await tx.wait(1);

    logger.info({
      txHash: receipt?.hash,
      orgWallet: orgWalletAddress,
      amount: amountInPol,
    }, 'Polygon: org wallet funded');

    return {
      txHash: receipt?.hash || tx.hash,
      amount: amountInPol,
    };
  } catch (err: any) {
    logger.error({ error: err.message, orgWalletAddress }, 'Polygon: failed to fund org wallet');
    return null;
  }
}

/**
 * Parsed DXER calldata structure.
 * Every field is traceable back to the original anchoring action.
 *
 * Calldata format:
 *   0x  +  44584552 ("DXER")  +  <64-char SHA-256 hash>  +  <entity marker hex>
 *
 * Entity marker (decoded): |entityType|entityId|
 *
 * Example:
 *   0x44584552  abc123...def  7c657870656e73657c...7c
 *   ──DXER──    ──hash───────  ─|expense|uuid-here|─
 */
export interface ParsedDxerCalldata {
  /** The SHA-256 hash that was anchored (from HyperLedger) */
  hash: string;
  /** The entity type (e.g., "expense", "invoice") — extracted from calldata */
  entityType: string | null;
  /** The entity ID (UUID) — extracted from calldata */
  entityId: string | null;
  /** Full raw calldata hex */
  rawHex: string;
}

/**
 * Parse DXER-formatted calldata from a Polygon transaction.
 * Returns null if the data is not in DXER format.
 *
 * Format: 0x + "DXER" (44584552) + SHA-256 hash (64 hex chars) + |entityType|entityId| (hex-encoded)
 */
export function parseDxerCalldata(data: string): ParsedDxerCalldata | null {
  if (!data || !data.startsWith('0x44584552')) return null;

  // Remove "0x" + "44584552" (DXER prefix) = 10 chars total
  const payload = data.slice(10);

  // First 64 hex chars = SHA-256 hash
  const hash = payload.slice(0, 64);
  if (hash.length !== 64) return null;

  // Remaining = entity marker hex
  let entityType: string | null = null;
  let entityId: string | null = null;

  const markerHex = payload.slice(64);
  if (markerHex.length > 0) {
    try {
      const markerStr = Buffer.from(markerHex, 'hex').toString('utf-8');
      // Format: |entityType|entityId|
      const parts = markerStr.split('|').filter(Boolean);
      if (parts.length >= 2) {
        entityType = parts[0];
        entityId = parts[1];
      }
    } catch {
      // Malformed marker — hash is still valid
    }
  }

  return { hash, entityType, entityId, rawHex: data };
}

/**
 * Retrieve transaction data from Polygon by transaction hash.
 * Used by DXEXPLORER for verification.
 *
 * Returns the full transaction with parsed DXER calldata,
 * including the extracted hash, entity type, and entity ID.
 * This makes every Polygon TX traceable back to the original record.
 */
export async function getPolygonTransaction(txHash: string): Promise<{
  hash: string;
  blockNumber: number;
  timestamp: number;
  data: string;
  from: string;
  to: string;
  confirmations: number;
  /** The SHA-256 hash extracted from calldata (from HyperLedger) */
  extractedHash: string | null;
  /** The entity type extracted from calldata (e.g., "expense") */
  extractedEntityType: string | null;
  /** The entity ID extracted from calldata (UUID) */
  extractedEntityId: string | null;
  explorerUrl: string;
} | null> {
  try {
    const p = getProvider();
    const tx = await p.getTransaction(txHash);

    if (!tx) {
      logger.warn({ txHash }, 'Polygon: transaction not found');
      return null;
    }

    // Wait for it to be confirmed if pending
    const receipt = await p.getTransactionReceipt(txHash);
    const block = receipt?.blockNumber
      ? await p.getBlock(receipt.blockNumber)
      : null;

    const currentBlock = await p.getBlockNumber();
    const confirmations = receipt?.blockNumber
      ? currentBlock - receipt.blockNumber
      : 0;

    // Parse DXER calldata — extracts hash + entity type + entity ID
    const parsed = parseDxerCalldata(tx.data);

    return {
      hash: tx.hash,
      blockNumber: receipt?.blockNumber || 0,
      timestamp: block?.timestamp || 0,
      data: tx.data,
      from: tx.from,
      to: tx.to || '',
      confirmations,
      extractedHash: parsed?.hash ?? null,
      extractedEntityType: parsed?.entityType ?? null,
      extractedEntityId: parsed?.entityId ?? null,
      explorerUrl: `${config.explorerUrl}/tx/${txHash}`,
    };
  } catch (err: any) {
    logger.error({ txHash, error: err.message }, 'Polygon: error fetching transaction');
    return null;
  }
}

/**
 * Get the wallet balance.
 */
export async function getWalletBalance(): Promise<string> {
  try {
    const p = getProvider();
    const w = getWallet();
    const balance = await p.getBalance(w.address);
    return ethers.formatEther(balance);
  } catch {
    return '0';
  }
}

export { config as polygonConfig };
