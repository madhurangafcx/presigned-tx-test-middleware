/**
 * Options for broadcasting a signed transaction
 * Currently includes metadata about the service and action being performed
 */
export interface BroadcastOptions {
  // Name of the service initiating the broadcast (e.g., "kyc-service", "land-registry")
  service: string;
  
  // Action being performed (e.g., "create-document", "update-record")
  action: string;
}

/**
 * Response object returned after attempting to broadcast a transaction to the blockchain
 */
export interface BroadcastResult {
  // Whether the transaction was successfully broadcast and accepted by the network
  success: boolean;
  
  // Hash/identifier of the transaction on the blockchain (if successful)
  txHash?: string;
  
  // Full response object from the blockchain (includes gas used, events, etc.)
  responses?: any;
}

/**
 * Broadcasts a previously signed transaction to the Cosmos blockchain
 * 
 * This function takes hex-encoded signed transaction bytes (generated offline)
 * and submits them to the blockchain via an RPC endpoint for processing and inclusion in a block.
 * 
 * @param signedTxHex - Hex string of the signed transaction bytes (from presignedTx generation)
 * @param _options - Broadcast options (service and action metadata)
 * @returns Promise containing success status, transaction hash, and full response
 * @throws Error if transaction validation fails or broadcast is rejected by the network
 */
export async function broadcastSignedTx(
  signedTxHex: string,
  _options: BroadcastOptions
): Promise<BroadcastResult> {
  try {
    // Validate that a signed transaction was provided
    if (!signedTxHex) throw new Error("signedTxHex is required");

    // Convert hex string to binary bytes that the blockchain can understand
    // Remove "0x" prefix if present to handle both formats
    const txBytes = Buffer.from(signedTxHex.replace(/^0x/, ""), "hex");

    // Dynamically import StargateClient for ESM module compatibility
    // This avoids issues with static imports in some build environments
    const { StargateClient } = await import("@cosmjs/stargate");

    // Get RPC endpoint from environment or use local node as fallback
    // RPC endpoint is the network node we're sending the transaction to
    const rpcUrl = process.env.COSMOS_RPC_URL || "http://localhost:26657";
    const client = await StargateClient.connect(rpcUrl);

    // Send the signed transaction bytes to the blockchain network
    // The network validates the signature and executes the transaction
    const result = await client.broadcastTx(txBytes);

    // Check if the blockchain rejected the transaction (code !== 0 means error)
    // rawLog contains the error message if something went wrong
    if (result.code !== 0) {
      throw new Error(`Broadcast failed (code ${result.code}): ${result.rawLog}`);
    }

    // Extract transaction hash from the result
    // Different versions of CosmJS may use different field names, so check all possibilities
    const txHash =
      (result as any).transactionHash ??     // Standard field name
      (result as any).txhash ??              // Alternative lowercase version
      (result as any).hash ??                // Fallback option
      "";                                    // Empty string if not found

    // Return success response with hash and full details
    return {
      success: true,
      txHash,
      responses: result,
    };
  } catch (err: any) {
    // Catch any errors and re-throw with a clear message
    // This includes network errors, validation failures, or broadcast rejections
    throw new Error(err.message || "Broadcast failed");
  }
}