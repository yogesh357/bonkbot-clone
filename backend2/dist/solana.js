import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();
const rpcConnection = new Connection(process.env.RPC_URL);
// console.log("+++=+===========", process.env.RPC_URL!);
export async function getBalanceMessge(public_key) {
    const balance = await rpcConnection.getBalance(new PublicKey(public_key));
    if (balance) {
        return {
            empty: false,
            message: `Your balance is ${balance / LAMPORTS_PER_SOL}`,
        };
    }
    else {
        return {
            empty: true,
            message: `Your balance is ${balance / LAMPORTS_PER_SOL}`,
        };
    }
}
//# sourceMappingURL=solana.js.map