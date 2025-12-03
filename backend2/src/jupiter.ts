import axios from "axios";
import {
  Connection,
  VersionedTransaction,
  PublicKey,
  Keypair,
} from "@solana/web3.js";
import bs58 from "bs58";
import dotenv from "dotenv";
dotenv.config();

const JUP_URL = "https://lite-api.jup.ag/swap/v1";
// const JUP_URL = "https://quote-api.jup.ag/v6";
const SOLANA_RPC_URL = process.env.RPC_URL as string;
export const connection = new Connection(SOLANA_RPC_URL, "confirmed");

//* Get me the best exchange rate to convert X SOL into Token Y
export async function getQuote(
  fromMint: string,
  toMint: string,
  amount: number
) {
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
  } catch (error) {
    console.log("QUOTE ERROR:", error);
    return null;
  }
}

export async function swap(
  quote: any,
  userPublicKey: string,
  privateKey: string
) {
  try {
    console.log("🔍 SWAP DEBUG - START");
    console.log("User Public Key:", userPublicKey);

    let secretKey: Uint8Array;

    if (privateKey.includes(",")) {
      console.log("🔄 Converting comma-separated private key to Uint8Array...");

      // Convert "243,3,151,197,..." to Uint8Array
      secretKey = new Uint8Array(privateKey.split(",").map(Number));
      console.log("✅ Converted to Uint8Array, length:", secretKey.length);
    } else {
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
    const swapTransactionBuf = Buffer.from(
      response.data.swapTransaction,
      "base64"
    );
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
  } catch (error: any) {
    console.log("❌ SWAP ERROR:", error.message);
    return null;
  }
}

export async function addPricesToPortfolio(
  tokens: { mint: string; amount: number }[]
) {
  // if (tokens.length === 0) return [];

  const BATCH_SIZE = 50;
  const results: any[] = [];

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const mints = batch.map((t) => t.mint).join(",");

    const resp = await axios.get("https://api.jup.ag/price/v3", {
      params: { ids: mints },
      headers: {
        // If your project has an API key, include it here:
        // "x-api-key": process.env.JUPITER_API_KEY
      },
    });

    const priceData = resp.data as Record<string, { usdPrice: number }>;

    for (const t of batch) {
      const priceInfo = priceData[t.mint];
      const price = priceInfo?.usdPrice ?? 0;
      const value = t.amount * price;
      results.push({ ...t, price, value });
    }
  }

  return results;
}
