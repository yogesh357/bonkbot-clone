import { Connection } from "@solana/web3.js";
export declare const connection: Connection;
export declare function getQuote(fromMint: string, toMint: string, amount: number): Promise<any>;
export declare function swap(quote: any, userPublicKey: string, privateKey: string): Promise<string | null>;
//# sourceMappingURL=jupiter.d.ts.map