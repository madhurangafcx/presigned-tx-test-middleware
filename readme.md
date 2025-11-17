# presigned-tx-test-middleware

A simple tool for creating and broadcasting signed blockchain transactions offline on Cosmos-based networks.

## What It Does

This middleware helps you:
- **Create signed transactions** without sending them to the blockchain immediately
- **Test transactions** before broadcasting to verify they're correct
- **Inspect transaction data** in hex format for debugging
- **Broadcast pre-signed transactions** when you're ready

## Why Use It

- Generate transactions offline for security (no private keys exposed during broadcast)
- Test transaction formatting and signatures before actual submission
- Integrate blockchain transactions into your applications with confidence
- Verify transaction structure and content

## How It Works

1. **Create**: Generate a signed transaction from your data 
2. **Inspect**: Review the hex-encoded transaction bytes
3. **Broadcast**: Send it to the blockchain when ready
4. **Verify**: Get transaction hash and confirmation

## Key Features

- Lightweight and fast
- Works with any Cosmos SDK chain
- Protobuf message serialization support
- Query blockchain state through REST endpoints
- Error handling and validation

## Use Cases

- Integration testing for blockchain applications
- Signature verification workflows
- Transaction payload inspection
- Developing blockchain payment systems
- Testing without spending real transaction fees (on testnet)

## 📦 Installation & Usage

### Install Dependencies
```bash
npm install
```

### Build Dependencies + middleware
```bash
npx tsc
```

### Build Dependencies + middleware
```bash
node dist/index.js
```

This runs and prints  `🚀 Server running on port 3001` on terminal.
---# presigned-tx-test-middleware
