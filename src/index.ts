import express from 'express';
import { broadcastSignedTx } from './cosmos-client.js';
import {
  QueryGetRegistryRequest,
  QueryClientImpl as QueryRegClient,
} from "./proto/elandnode/reg/v1/query.js";
import {
  QueryClient,
  createProtobufRpcClient,
} from '@cosmjs/stargate';
import { Tendermint37Client } from '@cosmjs/tendermint-rpc';
import { MsgRegisterLandRegistryResponse } from "./proto/elandnode/reg/v1/tx.js";


/**
 * Message decoder registry
 * Maps message type URLs to their decoder functions
 * This is used to decode the protobuf messages returned in msgResponses
 */
const messageRegistry = new Map<string, (data: Uint8Array) => any>([
  // Add your message decoders here
  // Example: "/elandnode.reg.v1.MsgRegisterLandRegistryResponse"
  [
    "/elandnode.reg.v1.MsgRegisterLandRegistryResponse",
    (data: Uint8Array) => MsgRegisterLandRegistryResponse.decode(data),
  ],
  // Add more message types as needed
  // ["/module.v1.MessageType", (data) => MessageType.decode(data)],
]);


/**
 * Pagination parameters for querying large datasets from the blockchain
 * Follows Cosmos SDK standard pagination format
 */
export interface PageRequest {
  // Starting key for pagination (used for cursor-based pagination)
  key?: Uint8Array;
  
  // Number of items to skip from the beginning
  offset?: number;
  
  // Maximum number of items to return
  limit?: number;
  
  // Whether to return the total count of items (can be expensive)
  countTotal?: boolean;
  
  // Whether to reverse the sorting order
  reverse?: boolean;
}

/**
 * Generic type for any Cosmos SDK query service constructor
 * Used to provide type safety when creating different query service instances
 */
type AnyQueryServiceCtor<T> = new (rpc: ReturnType<typeof createProtobufRpcClient>) => T;

/**
 * Initializes a connection to the blockchain and creates a query service instance
 * 
 * This establishes the RPC connection chain:
 * Tendermint37Client -> QueryClient -> createProtobufRpcClient -> ServiceCtor
 * 
 * @param ServiceCtor - Constructor for the specific query service (e.g., QueryRegClient)
 * @returns Object containing the query service instance and a close function to clean up the connection
 */
async function getQueryService<T>(ServiceCtor: AnyQueryServiceCtor<T>) {
  // Connect to the blockchain node's RPC endpoint
  const tm = await Tendermint37Client.connect('http://localhost:26657');
  
  // Create a query client wrapper around the Tendermint connection
  const qc = new QueryClient(tm);
  
  // Create a protobuf RPC client for serializing/deserializing messages
  const rpc = createProtobufRpcClient(qc);
  
  // Instantiate the specific query service (e.g., QueryRegClient for registry queries)
  const service = new ServiceCtor(rpc);
  
  // Return cleanup function to disconnect from the blockchain
  const close = () => tm.disconnect();
  
  return { service, close };
}

/**
 * Generic query function that calls any blockchain query method with automatic fallback
 * 
 * This function handles:
 * - Creating the appropriate query service
 * - Finding and calling the requested method
 * - Trying multiple request formats (in case the exact format is unknown)
 * - Proper error handling and resource cleanup
 * 
 * @param ServiceCtor - Query service constructor (e.g., QueryRegClient)
 * @param methodName - Name of the query method to call (e.g., "GetRegistry")
 * @param reqCandidates - Array of potential request objects to try in order
 * @returns Response from the blockchain query
 * @throws Error if method not found or all request candidates fail
 */
export async function queryAny<TService>(
  ServiceCtor: AnyQueryServiceCtor<TService>,
  methodName: string,
  reqCandidates: any[],
): Promise<any> {
  // Create the query service and get cleanup function
  const { service, close } = await getQueryService(ServiceCtor);
  
  try {
    // Get the method from the service instance
    const fn = (service as any)[methodName];
    
    // Verify the method exists and is callable
    if (typeof fn !== 'function') {
      // Extract available method names for helpful error message
      const available = Object.keys(service as any).filter(
        (k) => typeof (service as any)[k] === 'function',
      );
      throw new Error(
        `Method '${methodName}' not found. Available: ${available.join(', ')}`,
      );
    }

    // Try each request candidate until one succeeds
    // This handles cases where we're unsure of the exact request format
    let lastError: unknown;
    for (const req of reqCandidates) {
      try {
        // Call the query method with the current request candidate
        return await fn.call(service, req);
      } catch (e) {
        // Store the error and try the next candidate
        lastError = e;
      }
    }
    
    // If no candidates succeeded, throw the last error
    throw lastError ?? new Error('All request candidates failed.');
  } finally {
    // Always disconnect from the blockchain, even if an error occurred
    close();
  }
}

// Server Setup 
const app = express();

// Configure middleware to handle large JSON payloads (up to 100MB)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

/**
 * Health check endpoint
 * Returns a simple OK status to verify the server is running
 */
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

/**
 * Endpoint: POST /api/upload/create-presigned
 * 
 * Broadcasts a presigned transaction to the blockchain
 * 
 * Request body:
 * {
 *   "signedTxHex": "0a8f010a8c01..." // Hex-encoded signed transaction bytes
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "txHash": "ABC123...",
 *   "responses": { ...full blockchain response... }
 * }
 */
app.post('/api/upload/create-presigned', async (req, res) => {
  const { signedTxHex } = req.body;
  
  // Validate required parameter
  if (!signedTxHex)
    return res
      .status(400)
      .json({ status: 'error', message: 'signedTxHex required' });

  try {
    // Broadcast the signed transaction and decode message responses
    // Pass the messageRegistry to automatically decode protobuf messages
    const result = await broadcastSignedTx(signedTxHex, {
      service: 'upload-service',
      action: '/elandnode.reg.v1.MsgRegisterLandRegistry',
    }, messageRegistry);

    // Set content type and send response
    // BigInt values are converted to strings for JSON serialization
    res.setHeader('Content-Type', 'application/json');
    res.send(
      JSON.stringify(result, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
    );
  } catch (error: any) {
    console.error('Error broadcasting transaction:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

/**
 * Endpoint: GET /get/create-presigned/GetRegistry
 * 
 * Queries the registry from the blockchain
 * Returns registry information for a specific registry ID
 * 
 * Response:
 * {
 *   "status": "success",
 *   "data": { ...registry details... }
 * }
 */
app.get('/get/create-presigned/GetRegistry', async (_req, res) => {
  try {
    // Construct the query request with the registry ID to look up
    const request: QueryGetRegistryRequest = {
      registryId: 'eland1962wfhny5xkeyknf75fx3cuh5j3aj3ha9e383s'
    }

    console.log('Calling GetRegistry with request:', request);
    
    // Query the blockchain using the generic query function
    // Passes the request as a candidate for the GetRegistry method
    const result = await queryAny(QueryRegClient, 'GetRegistry', [request]);
    
    // Return successful response with the registry data
    res.json({
      status: 'success',
      data: result,
    });
    
  } catch (error: any) {
    // Handle any errors during the query
    console.error('Error getting record:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Start the Express server on port 3001
app.listen(3001, () => console.log('🚀 Server running on port 3001'));