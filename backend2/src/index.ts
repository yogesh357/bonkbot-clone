// import { PrismaClient } from "@prisma/client/extension";
import { Markup, Telegraf } from "telegraf";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PrismaClient } from "./generated/prisma/client.js";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";
import { getBalanceMessge } from "./solana.js";
import { getQuote, swap } from "./jupiter.js";
dotenv.config();

//:prisma
const prismaConnection = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(prismaConnection);
const prismaClient = new PrismaClient({ adapter });

//:TG -bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
  
//:RPC-connection
// const rpcConnection = new Connection(process.env.REC_URL!);

const PENDING_USER_BUYS: Record<
  string,
  {
    isPending: boolean;
    mint?: string;
  }
> = {};

const DEFAULT_KEYBOARD = Markup.inlineKeyboard([
  [
    Markup.button.callback("Show public Key", "public_key"),
    Markup.button.callback("Show private Key", "private_key"),
  ],
  [Markup.button.callback("Buy", "buy")],
]);

bot.start(async (ctx: any) => {
  const existingUser = await prismaClient.users.findFirst({
    where: {
      tgUserId: ctx.chat.id.toString(),
    },
  });
  // ctx.reply("welcome");
  if (existingUser) {
    const publicKey = existingUser.publicKey;
    const { empty, message } = await getBalanceMessge(
      existingUser.publicKey.toString()
    );

    ctx.reply(
      `Welcome back and here is your public key : ${publicKey} , now you can trade Solana with it.
      ${empty ? message : message}
      `,
      {
        ...DEFAULT_KEYBOARD,
      }
    );
  } else {
    const keypair = Keypair.generate();
    await prismaClient.users.create({
      data: {
        tgUserId: ctx.chat.id.toString(),
        publicKey: keypair.publicKey.toBase58(),
        privateKey: keypair.secretKey.toString(),
      },
    });
    const publicKey = keypair.publicKey.toString();

    ctx.reply(
      `Welcome back and here is your public key : ${publicKey} , now you can trade Solana with it.`,
      {
        ...DEFAULT_KEYBOARD,
      }
    );
  }
});

bot.action("private_key", async (ctx) => {
  const tgUserId = ctx?.chat?.id.toString()!;

  const user = await prismaClient.users.findFirst({
    where: {
      tgUserId,
    },
  });
  return ctx.reply(`Your private key is ${user?.privateKey}`, {
    ...DEFAULT_KEYBOARD,
  });
});

// bot.action("public_key", async (ctx) => {
//   const tgUserId = ctx?.chat?.id.toString()!;
//   const user = await prismaClient.users.findFirst({
//     where: {
//       tgUserId,
//     },
//   });
//   const { empty, message } = await getBalanceMessge(user.publicKey.toString());
//   return ctx.reply(
//     `Your public key is ${user?.publicKey} . ${empty ? message : message}`,
//     {
//       ...DEFAULT_KEYBOARD,
//     }
//   );
// });
bot.action("public_key", async (ctx) => {
  const tgUserId = ctx.chat?.id.toString();

  if (!tgUserId) {
    return ctx.reply("Something went wrong. Could not read Telegram user ID.");
  }

  const user = await prismaClient.users.findFirst({
    where: { tgUserId },
  });

  if (!user) {
    return ctx.reply("You are not registered yet! Please register first.");
  }

  const { empty, message } = await getBalanceMessge(user.publicKey);

  return ctx.reply(
    `Your public key is: ${user.publicKey}\n\n${message}`,
    DEFAULT_KEYBOARD
  );
});

bot.action("buy", async (ctx) => {
  PENDING_USER_BUYS[ctx.chat?.id!] = {
    isPending: true,
  };
  return ctx.reply("What token mint do you wnat to buy");
});

// bot.on("text", (ctx) => {
//   const message = ctx.message.text;
//   if (PENDING_USER_BUYS[ctx.chat.id]?.isPending) {
//     PENDING_USER_BUYS[ctx.chat.id!]?.mint = message;
//   }
// });

// bot.on("text", async (ctx) => {
//   const chatId = ctx.chat?.id.toString();
//   const message = ctx.message.text;

//   if (!chatId) return; // safety check

//   const pending = PENDING_USER_BUYS[chatId];

//   if (pending?.isPending) {
//     pending.mint = message;
//     ctx.reply(`Mint updated to: ${message}`);
//   } else if (pending?.isPending && pending.mint) {
//     const amount = message;
//     const swapTxn = await swap(
//       "So11111111111111111111111111112",
//       pending.mint,
//       Number(message) * LAMPORTS_PER_SOL
//     );
//     delete PENDING_USER_BUYS[chatId];
//     // const quote = await getQuote(
//     //   "So11111111111111111111111111112", // SOL Mint
//     //   pending.mint, // token mint user selected
//     //   Number(message) * LAMPORTS_PER_SOL
//     // );
//     // if (!quote) return ctx.reply("Failed to fetch quote. Try again!");
//     // const swapTxn = await swap(
//     //   quote,
//     //   , // must store this for user
//     //   pending.privateKey // securely stored!
//     // );
//     ctx.reply(
//       `Swap Succesful , you can track it here https://solscan.io/tx/${swapTxn}`
//     );
//   }
// });

bot.on("text", async (ctx) => {
  const chatId = ctx.chat?.id.toString();
  const message = ctx.message.text;

  if (!chatId) return; // safety check

  const pending = PENDING_USER_BUYS[chatId];

  if (pending?.isPending) {
    // If mint is not set yet, this is the first message (mint address)
    if (!pending.mint) {
      pending.mint = message;
      ctx.reply(
        `Mint set to: ${message}\n\nNow please enter the amount in SOL you want to spend:`
      );
    }
    // If mint is already set, this is the second message (amount)
    else {
      const amountInSol = parseFloat(message);

      // Validate amount
      if (isNaN(amountInSol) || amountInSol <= 0) {
        ctx.reply("Please enter a valid amount in SOL (e.g., 0.1, 1.5)");
        return;
      }

      try {
        ctx.reply("🔄 Processing your swap...");

        // Get user from database to access their wallet
        const user = await prismaClient.users.findFirst({
          where: { tgUserId: chatId },
        });

        if (!user) {
          ctx.reply("User not found. Please start over with /start");
          delete PENDING_USER_BUYS[chatId];
          return;
        }

        // Get quote from Jupiter
        const quote = await getQuote(
          "So11111111111111111111111111111111111111112", // SOL mint (fixed)
          pending.mint, // token mint user selected
          amountInSol * LAMPORTS_PER_SOL
        );

        if (!quote) {
          ctx.reply(
            "Failed to get quote. Please check the mint address and try again."
          );
          delete PENDING_USER_BUYS[chatId];
          return;
        }

        // Perform swap using user's wallet
        const swapTxn = await swap(quote, user.publicKey, user.privateKey);

        if (!swapTxn) {
          ctx.reply("Swap failed. Please try again.");
          delete PENDING_USER_BUYS[chatId];
          return;
        }

        // Clean up and show success
        delete PENDING_USER_BUYS[chatId];
        ctx.reply(
          `✅ Swap Successful!\n\nYou can track it here: https://solscan.io/tx/${swapTxn}`,
          DEFAULT_KEYBOARD
        );
      } catch (error) {
        console.error("Swap error:", error);
        ctx.reply("❌ An error occurred during the swap. Please try again.");
        delete PENDING_USER_BUYS[chatId];
      }
    }
  }
});

bot.launch();
