import { getMint } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import axios from "axios";
import dotenv from "dotenv";
import { message } from "telegraf/filters";
dotenv.config();

const rpcConnection = new Connection(process.env.RPC_URL!);

interface returnPromise {
  empty: boolean;
  message: string;
}

export async function getBalanceMessge(
  public_key: string
): Promise<returnPromise> {
  const balance = await rpcConnection.getBalance(new PublicKey(public_key));
  if (balance) {
    return {
      empty: false,
      message: `Your balance is ${balance / LAMPORTS_PER_SOL}`,
    };
  } else {
    return {
      empty: true,
      message: `Your balance is ${balance / LAMPORTS_PER_SOL}`,
    };
  }
}

export async function getPortfolio(publicKey: string) {
  try {
    const owner = new PublicKey(publicKey);

    // Get all token accounts
    const tokenAccounts = await rpcConnection.getParsedTokenAccountsByOwner(
      owner,
      {
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      }
    );
    console.log("token account ::::", tokenAccounts);

    const tokens: any[] = [];

    for (const { account } of tokenAccounts.value) {
      const data = account.data.parsed.info;

      const mint = data.mint;
      const rawAmount = parseInt(data.tokenAmount.amount, 10);
      const decimals = data.tokenAmount.decimals;
      const amount = rawAmount / 10 ** decimals;

      if (amount < 0.000001) continue; // ignore dust

      tokens.push({ mint, amount });
    }
    console.log("-----------tokens--::", tokens);
    return tokens;
  } catch (err) {
    console.error("Portfolio error:", err);
    return [];
  }
}

export async function formatOutAmount(mintAddress: string, raw: string) {
  const mintInfo = await getMint(rpcConnection, new PublicKey(mintAddress));
  const decimals = mintInfo.decimals;
  const human = Number(raw) / Math.pow(10, decimals);
  return human;
}
