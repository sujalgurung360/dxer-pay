import { ethers } from 'ethers';
import { createHash } from 'crypto';
import { logger } from './logger.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * DXER On-Chain Hiring Record
 * ═══════════════════════════════════════════════════════════════
 *
 * When an employee completes onboarding, this module creates
 * on-chain transactions that link the org address to the employee
 * address on Polygon. This is visible on PolygonScan as:
 *
 *   1. A direct POL transfer: Org Wallet → Employee Wallet
 *      (funds the employee with gas + proves the relationship)
 *
 *   2. A DXER anchoring TX from the org wallet with calldata
 *      containing: DXER prefix + hire data hash + both addresses
 *      (immutable proof of the hiring event)
 *
 * On PolygonScan, the org's address page will show:
 *   - An outgoing transfer TO the employee address (not self)
 *   - Both addresses connected in the transaction history
 *
 * On PolygonScan, the employee's address page will show:
 *   - An incoming transfer FROM the org address
 *   - Proving the employment relationship
 * ═══════════════════════════════════════════════════════════════
 */

const polygonConfig = {
  network: process.env.POLYGON_NETWORK || 'amoy',
  chainId: parseInt(process.env.POLYGON_CHAIN_ID || '80002'),
  rpcUrl: process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology',
  explorerUrl: process.env.POLYGON_EXPLORER_URL || 'https://amoy.polygonscan.com',
};

let cachedProvider: ethers.JsonRpcProvider | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!cachedProvider) {
    cachedProvider = new ethers.JsonRpcProvider(polygonConfig.rpcUrl, {
      name: polygonConfig.network,
      chainId: polygonConfig.chainId,
    });
  }
  return cachedProvider;
}

function getSignerWallet(privateKey: string): ethers.Wallet {
  const pk = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  return new ethers.Wallet(pk, getProvider());
}

/**
 * Build the canonical metadata for a "hired" event.
 */
function buildHireMetadata(params: {
  orgAddress: string;
  employeeAddress: string;
  employeeName: string;
  position: string;
  employeeId: string;
  orgId: string;
}): string {
  const canonical = {
    entityType: 'employee_hired',
    event: 'hired',
    orgAddress: params.orgAddress.toLowerCase(),
    employeeAddress: params.employeeAddress.toLowerCase(),
    employeeName: params.employeeName,
    position: params.position,
    employeeId: params.employeeId,
    orgId: params.orgId,
    timestamp: new Date().toISOString(),
  };
  return JSON.stringify(canonical, Object.keys(canonical).sort());
}

/**
 * Build DXER-prefixed calldata for the hire event.
 *
 * Format: 0x + "DXER" + SHA-256 hash + |employee_hired|employeeId|employeeAddress|
 *
 * This is the same format used by the anchoring system, but with
 * the employee address embedded in the entity marker. This makes it
 * traceable in DXEXPLORER AND shows the relationship on-chain.
 */
function buildHireCalldata(hash: string, employeeId: string, employeeAddress: string): string {
  const prefix = Buffer.from('DXER').toString('hex'); // 44584552
  const entityMarker = Buffer.from(`|employee_hired|${employeeId}|${employeeAddress}|`).toString('hex');
  return `0x${prefix}${hash}${entityMarker}`;
}

/**
 * Record an employee hire on the Polygon blockchain.
 *
 * Creates TWO on-chain transactions:
 *
 * 1. FUNDING TX: Org wallet sends a small amount of POL to the employee wallet.
 *    This creates a direct org→employee transfer visible on PolygonScan,
 *    showing the two addresses are connected.
 *
 * 2. ANCHOR TX: Org wallet sends a 0-value TX to the EMPLOYEE address (not self!)
 *    with DXER-formatted calldata containing the hire event hash.
 *    This creates another org→employee link WITH verifiable data.
 *
 * Both transactions show up on the org's address page as outgoing to the
 * employee, and on the employee's page as incoming from the org.
 */
export async function recordHireOnChain(params: {
  orgPrivateKey: string;
  employeeWalletAddress: string;
  employeeName: string;
  position: string;
  employeeId: string;
  orgId: string;
}): Promise<{
  hireTxHash: string;
  fundTxHash: string | null;
  hireDataHash: string;
  blockNumber: number;
  explorerUrl: string;
  fundExplorerUrl: string | null;
  orgAddress: string;
  employeeAddress: string;
  calldata: string;
}> {
  const { orgPrivateKey, employeeWalletAddress, employeeName, position, employeeId, orgId } = params;
  const signer = getSignerWallet(orgPrivateKey);
  const orgAddress = signer.address;

  logger.info({
    orgAddress,
    employeeAddress: employeeWalletAddress,
    employeeName,
  }, 'HiringOnChain: recording hire');

  // Step 1: Build canonical metadata & hash
  const metadata = buildHireMetadata({
    orgAddress,
    employeeAddress: employeeWalletAddress,
    employeeName,
    position: position || 'Employee',
    employeeId,
    orgId,
  });
  const hireDataHash = createHash('sha256').update(metadata).digest('hex');

  // Step 2: Fund the employee wallet (org → employee direct transfer)
  // This creates a visible connection between the two addresses
  let fundTxHash: string | null = null;
  let fundExplorerUrl: string | null = null;

  try {
    const fundAmount = ethers.parseEther('0.005');
    const balance = await getProvider().getBalance(orgAddress);

    if (balance > fundAmount * 3n) {
      logger.info({
        from: orgAddress,
        to: employeeWalletAddress,
        amount: '0.005 POL',
      }, 'HiringOnChain: funding employee wallet');

      const fundTx = await signer.sendTransaction({
        to: employeeWalletAddress,
        value: fundAmount,
      });
      const fundReceipt = await fundTx.wait(1);
      fundTxHash = fundReceipt?.hash || fundTx.hash;
      fundExplorerUrl = `${polygonConfig.explorerUrl}/tx/${fundTxHash}`;

      logger.info({ fundTxHash }, 'HiringOnChain: employee funded');
    } else {
      logger.warn({
        balance: ethers.formatEther(balance),
      }, 'HiringOnChain: org wallet low on funds, skipping employee funding');
    }
  } catch (err: any) {
    logger.warn({ error: err.message }, 'HiringOnChain: failed to fund employee');
  }

  // Step 3: Send the "hired" anchor TX to the EMPLOYEE address (not self!)
  // This is the key difference from normal anchoring: the TX goes TO the employee,
  // creating a two-address relationship on PolygonScan
  const calldata = buildHireCalldata(hireDataHash, employeeId, employeeWalletAddress);

  logger.info({
    to: employeeWalletAddress,
    calldataLength: calldata.length,
    hash: hireDataHash,
  }, 'HiringOnChain: submitting hire anchor TX');

  const hireTx = await signer.sendTransaction({
    to: employeeWalletAddress, // Send TO employee address, NOT self
    value: 0,
    data: calldata,
  });

  const hireReceipt = await hireTx.wait(1);
  const hireTxHash = hireReceipt?.hash || hireTx.hash;

  const result = {
    hireTxHash,
    fundTxHash,
    hireDataHash,
    blockNumber: hireReceipt?.blockNumber || 0,
    explorerUrl: `${polygonConfig.explorerUrl}/tx/${hireTxHash}`,
    fundExplorerUrl,
    orgAddress,
    employeeAddress: employeeWalletAddress,
    calldata,
  };

  logger.info(result, 'HiringOnChain: hire recorded on-chain ✓');
  return result;
}

/**
 * Parse hire event calldata from a Polygon transaction.
 * Returns null if not a hire event.
 */
export function parseHireCalldata(data: string): {
  hash: string;
  employeeId: string;
  employeeAddress: string;
} | null {
  if (!data || !data.startsWith('0x44584552')) return null;

  const payload = data.slice(10); // Remove 0x + DXER prefix
  const hash = payload.slice(0, 64);
  if (hash.length !== 64) return null;

  const markerHex = payload.slice(64);
  if (markerHex.length === 0) return null;

  try {
    const markerStr = Buffer.from(markerHex, 'hex').toString('utf-8');
    const parts = markerStr.split('|').filter(Boolean);
    // Format: employee_hired|employeeId|employeeAddress
    if (parts.length >= 3 && parts[0] === 'employee_hired') {
      return {
        hash,
        employeeId: parts[1],
        employeeAddress: parts[2],
      };
    }
  } catch {
    // Not a hire event
  }

  return null;
}
