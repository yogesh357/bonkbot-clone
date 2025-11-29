import axios from "axios";
import { Connection, VersionedTransaction, PublicKey, Keypair, } from "@solana/web3.js";
import bs58 from "bs58";
import dotenv from "dotenv";
dotenv.config();
const JUP_URL = "https://lite-api.jup.ag/swap/v1";
// const JUP_URL = "https://quote-api.jup.ag/v6";
const SOLANA_RPC_URL = process.env.RPC_URL;
export const connection = new Connection(SOLANA_RPC_URL, "confirmed");
// (1) Get Quote
export async function getQuote(fromMint, toMint, amount) {
    try {
        const response = await axios.get(`${JUP_URL}/quote`, {
            params: {
                inputMint: fromMint,
                outputMint: toMint,
                amount,
                slippageBps: 50, // 0.5% slippage
            },
        });
        return response.data;
    }
    catch (error) {
        console.log("QUOTE ERROR:", error);
        return null;
    }
}
// export async function swap(
//   quote: any,
//   userPublicKey: string,
//   privateKey: string
// ) {
//   try {
//     const response = await axios.post(`${JUP_URL}/swap`, {
//       quoteResponse: quote,
//       userPublicKey,
//       wrapAndUnwrapSol: true,
//     });
//     const swapTransactionBuf = Buffer.from(
//       response.data.swapTransaction,
//       "base64"
//     );
//     const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
//     // const decodedKey = bs58.decode(privateKey);
//     // transaction.sign([decodedKey]);
//     const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
//     transaction.sign([keypair]);
//     const txid = await connection.sendRawTransaction(transaction.serialize(), {
//       skipPreflight: false,
//       maxRetries: 5,
//     });
//     await connection.confirmTransaction(txid, "confirmed");
//     return txid;
//   } catch (error) {
//     console.log("SWAP ERROR:", error);
//     return null;
//   }
// }
export async function swap(quote, userPublicKey, privateKey) {
    try {
        console.log("🔍 SWAP DEBUG - START");
        console.log("User Public Key:", userPublicKey);
        console.log("Private Key type:", typeof privateKey);
        let secretKey;
        // Check if it's stored as comma-separated Uint8Array (incorrect format)
        if (privateKey.includes(",")) {
            console.log("🔄 Converting comma-separated private key to Uint8Array...");
            // Convert "243,3,151,197,..." to Uint8Array
            secretKey = new Uint8Array(privateKey.split(",").map(Number));
            console.log("✅ Converted to Uint8Array, length:", secretKey.length);
        }
        else {
            // Assume it's already in base58 format
            console.log("🔑 Private key appears to be in base58 format");
            secretKey = bs58.decode(privateKey);
        }
        // Validate the secret key length
        if (secretKey.length !== 64) {
            console.log("❌ Invalid secret key length:", secretKey.length);
            return null;
        }
        console.log("Starting swap process...");
        const response = await axios.post(`${JUP_URL}/swap`, {
            quoteResponse: quote,
            userPublicKey,
            wrapAndUnwrapSol: true,
        });
        console.log("✅ Jupiter swap response received");
        const swapTransactionBuf = Buffer.from(response.data.swapTransaction, "base64");
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        // Use the converted secret key directly
        const keypair = Keypair.fromSecretKey(secretKey);
        transaction.sign([keypair]);
        console.log("🔄 Sending transaction...");
        const txid = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            maxRetries: 5,
        });
        await connection.confirmTransaction(txid, "confirmed");
        console.log("✅ Swap successful, TXID:", txid);
        return txid;
    }
    catch (error) {
        console.log("❌ SWAP ERROR:", error.message);
        return null;
    }
}
//# sourceMappingURL=jupiter.js.map