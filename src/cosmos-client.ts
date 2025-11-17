/**
 * Options for broadcasting a signed transaction
 */
export interface BroadcastOptions {
  service: string;
  action: string;
}

/**
 * Decoded protobuf message response from blockchain
 */
export interface DecodedMessage {
  // The message type URL (e.g., "/elandnode.reg.v1.MsgRegisterLandRegistryResponse")
  typeUrl: string;
  
  // The decoded message object (varies by message type)
  decodedValue: any;
}

/**
 * Response object returned after broadcasting a transaction
 */
export interface BroadcastResult {
  // Whether the transaction was successfully broadcast and accepted by the network
  success: boolean;
  
  // Hash/identifier of the transaction on the blockchain (if successful)
  txHash?: string;
  
  // Decoded message responses from the transaction execution
  decodedMessages?: DecodedMessage[];
  
  // Full response object from the blockchain (includes gas used, events, etc.)
  responses?: any;
}

/**
 * Converts decimal byte array to Uint8Array
 * The blockchain returns msgResponses.value as object with numeric keys (0, 1, 2, ...)
 * This function reconstructs the original binary data
 * 
 * @param decimalArray - Object with numeric keys containing byte values
 * @returns Uint8Array of the binary data
 */
function decimalBytesToUint8Array(decimalArray: any): Uint8Array {
  const keys = Object.keys(decimalArray)
    .map(Number)
    .sort((a, b) => a - b);
  
  return new Uint8Array(keys.map(key => decimalArray[key]));
}

/**
 * Decodes a protobuf message from binary bytes
 * 
 * @param typeUrl - The message type URL (e.g., "/elandnode.reg.v1.MsgRegisterLandRegistryResponse")
 * @param messageBytes - Binary protobuf message data
 * @param messageRegistry - Map of typeUrl to message decoder functions
 * @returns Decoded message object
 */
function decodeProtobufMessage(
  typeUrl: string,
  messageBytes: Uint8Array,
  messageRegistry: Map<string, (data: Uint8Array) => any>
): any {
  const decoder = messageRegistry.get(typeUrl);
  
  if (!decoder) {
    console.warn(`No decoder found for ${typeUrl}, returning raw bytes`);
    return {
      error: `Unknown message type: ${typeUrl}`,
      rawBytes: Array.from(messageBytes),
    };
  }
  
  try {
    return decoder(messageBytes);
  } catch (error: any) {
    console.error(`Error decoding ${typeUrl}:`, error);
    return {
      error: `Failed to decode: ${error.message}`,
      rawBytes: Array.from(messageBytes),
    };
  }
}

/**
 * Extracts and decodes message responses from blockchain transaction result
 * 
 * The blockchain returns encoded protobuf messages in msgResponses array.
 * This function:
 * 1. Extracts the msgResponses from the transaction result
 * 2. Converts decimal bytes back to Uint8Array
 * 3. Decodes each message using the provided registry
 * 
 * @param result - Broadcast transaction result from blockchain
 * @param messageRegistry - Map of typeUrl to message decoder functions
 * @returns Array of decoded messages with their type URLs
 */
function extractAndDecodeMessages(
  result: any,
  messageRegistry: Map<string, (data: Uint8Array) => any>
): DecodedMessage[] {
  const decodedMessages: DecodedMessage[] = [];
  
  // Check if msgResponses exists in the result
  if (!result.msgResponses || !Array.isArray(result.msgResponses)) {
    console.warn('No msgResponses found in transaction result');
    return decodedMessages;
  }
  
  // Process each message response
  for (const msgResponse of result.msgResponses) {
    try {
      // Extract the type URL
      const typeUrl = msgResponse.typeUrl;
      
      // Convert decimal byte array to Uint8Array
      const messageBytes = decimalBytesToUint8Array(msgResponse.value);
      
      // Decode the protobuf message
      const decodedValue = decodeProtobufMessage(typeUrl, messageBytes, messageRegistry);
      
      decodedMessages.push({
        typeUrl,
        decodedValue,
      });
    } catch (error: any) {
      console.error('Error processing msgResponse:', error);
      decodedMessages.push({
        typeUrl: msgResponse.typeUrl || 'unknown',
        decodedValue: { error: error.message },
      });
    }
  }
  
  return decodedMessages;
}

/**
 * Broadcasts a previously signed transaction to the Cosmos blockchain
 * 
 * This function:
 * 1. Takes hex-encoded signed transaction bytes (generated offline)
 * 2. Submits them to the blockchain via an RPC endpoint
 * 3. Extracts and decodes protobuf message responses
 * 4. Returns transaction hash and decoded messages
 * 
 * @param signedTxHex - Hex string of the signed transaction bytes
 * @param _options - Broadcast options (service and action metadata)
 * @param messageRegistry - Optional map of typeUrl to message decoder functions for decoding responses
 * @returns Promise containing success status, transaction hash, decoded messages, and full response
 * @throws Error if transaction validation fails or broadcast is rejected by the network
 */
export async function broadcastSignedTx(
  signedTxHex: string,
  _options: BroadcastOptions,
  messageRegistry?: Map<string, (data: Uint8Array) => any>
): Promise<BroadcastResult> {
  try {
    // Validate that a signed transaction was provided
    if (!signedTxHex) throw new Error("signedTxHex is required");

    // Convert hex string to binary bytes that the blockchain can understand
    // Remove "0x" prefix if present to handle both formats
    const txBytes = Buffer.from(signedTxHex.replace(/^0x/, ""), "hex");

    // Dynamically import StargateClient for ESM module compatibility
    const { StargateClient } = await import("@cosmjs/stargate");

    // Get RPC endpoint from environment or use local node as fallback
    const rpcUrl = process.env.COSMOS_RPC_URL || "http://localhost:26657";
    const client = await StargateClient.connect(rpcUrl);

    // Send the signed transaction bytes to the blockchain network
    const result = await client.broadcastTx(txBytes);

    // Check if the blockchain rejected the transaction
    if (result.code !== 0) {
      throw new Error(`Broadcast failed (code ${result.code}): ${result.rawLog}`);
    }

    // Extract transaction hash with fallback for different field names
    const txHash =
      (result as any).transactionHash ??
      (result as any).txhash ??
      (result as any).hash ??
      "";

    // Extract and decode message responses if decoder registry is provided
    const decodedMessages = messageRegistry
      ? extractAndDecodeMessages(result, messageRegistry)
      : undefined;

    // Return success response with decoded messages
    return {
      success: true,
      txHash,
      decodedMessages,
      responses: result,
    };
  } catch (err: any) {
    throw new Error(err.message || "Broadcast failed");
  }
}