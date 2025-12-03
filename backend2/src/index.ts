import { Markup, Telegraf } from "telegraf";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PrismaClient } from "./generated/prisma/client.js";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";
import { formatOutAmount, getBalanceMessge, getPortfolio } from "./solana.js";
import { addPricesToPortfolio, getQuote, swap } from "./jupiter.js";
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
    amount?: number;
    quote?: any;
  }
> = {};

const DEFAULT_KEYBOARD = Markup.inlineKeyboard([
  [
    Markup.button.callback("Show public Key", "public_key"),
    Markup.button.callback("Show private Key", "private_key"),
  ],
  [
    Markup.button.callback("Buy", "buy"),
    Markup.button.callback("Account", "account"),
  ],
]);

bot.start(async (ctx: any) => {
  const existingUser = await prismaClient.users.findFirst({
    where: {
      tgUserId: ctx.chat.id.toString(),
    },
  });
  if (existingUser) {
    const publicKey = existingUser.publicKey;
    const { empty, message } = await getBalanceMessge(
      existingUser.publicKey.toString()
    );

    ctx.reply(
      `<b>👋 Welcome Back!</b>\n\n` +
        `Your Solana wallet is ready to use 🚀\n\n` +
        `<b>Public Key:</b>\n<code>${publicKey}</code>\n\n` +
        `${message}\n\n` +
        `You can now securely trade and manage Solana assets directly from this bot ✨`,
      {
        parse_mode: "HTML",
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
      `<b>👋 Welcome Back!</b>\n\n` +
        `Your Solana wallet is ready for trading on the network 🚀\n\n` +
        `<b>Public Key:</b>\n<code>${publicKey}</code>\n\n` +
        `Use this address to deposit SOL or tokens and start swapping instantly ✨`,
      {
        parse_mode: "HTML",
        ...DEFAULT_KEYBOARD,
      }
    );
  }
});

bot.command("portfolio", async (ctx) => {
  const chatId = ctx.chat?.id.toString();
  if (!chatId) return;

  const user = await prismaClient.users.findFirst({
    where: { tgUserId: chatId },
  });

  if (!user) {
    return ctx.reply(
      `<b>⚠️ Wallet not registered!</b>\nUse /start to create one.`,
      { parse_mode: "HTML" }
    );
  }

  await ctx.reply("📡 Fetching your portfolio...");

  const tokens = await getPortfolio(user.publicKey);
  const portfolio = await addPricesToPortfolio(tokens);

  if (portfolio.length === 0) {
    return ctx.reply(
      `<b>📭 No tokens found</b>\nDeposit SPL tokens to view portfolio.`,
      { parse_mode: "HTML" }
    );
  }

  let totalValue = 0;

  const lines = portfolio.map((t) => {
    totalValue += t.value;
    return `${t.mint}\n<b>${t.amount.toFixed(4)}</b> (~$${t.value.toFixed(
      2
    )})\n`;
  });

  return ctx.reply(
    `<b>📊 Your Portfolio</b>\n\n` +
      lines.join("\n") +
      `\n<b>💎 Total Value:</b> $${totalValue.toFixed(2)}`,
    { parse_mode: "HTML" }
  );
});

bot.action("private_key", async (ctx) => {
  const tgUserId = ctx?.chat?.id.toString()!;

  const user = await prismaClient.users.findFirst({
    where: {
      tgUserId,
    },
  });
  return ctx.reply(
    `<b>⚠️ Sensitive Information</b>\n\n` +
      `Here is your <b>Private Key</b> — keep this <u>absolutely secret</u>.\n` +
      `Anyone with this key can control your funds.\n\n` +
      `<code>${user?.privateKey}</code>\n\n` +
      `Do <b>not</b> share or store it in screenshots or chats.`,
    {
      parse_mode: "HTML",
      ...DEFAULT_KEYBOARD,
    }
  );
});

bot.action("public_key", async (ctx) => {
  const tgUserId = ctx.chat?.id.toString();

  if (!tgUserId) {
    return ctx.reply("Something went wrong. Could not read Telegram user ID.");
  }

  const user = await prismaClient.users.findFirst({
    where: { tgUserId },
  });

  if (!user) {
    return ctx.reply(
      `<b>⚠️ Wallet Not Found</b>\n\n` +
        `You are not registered yet. Please use /start to create your Solana wallet.`,
      { parse_mode: "HTML" }
    );
  }

  const { empty, message } = await getBalanceMessge(user.publicKey);

  return ctx.reply(
    `<b>🔐 Your Wallet</b>\n\n` +
      `<b>Public Key:</b>\n<code>${user.publicKey}</code>\n\n` +
      `${message}\n\n` +
      `You can now trade Solana tokens securely 🚀`,
    {
      parse_mode: "HTML",
      ...DEFAULT_KEYBOARD,
    }
  );
});

bot.action("buy", async (ctx) => {
  PENDING_USER_BUYS[ctx.chat?.id!] = {
    isPending: true,
  };
  return ctx.reply(
    `<b>🪙 Select Your Token</b>\n\n` +
      `Please enter the <b>token mint address</b> you want to buy.\n\n` +
      `Example:\n<code>EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v</code> (USDC)`,
    {
      parse_mode: "HTML",
      ...DEFAULT_KEYBOARD,
    }
  );
});

 
bot.on("text", async (ctx) => {
  const chatId = ctx.chat?.id.toString();
  const message = ctx.message.text;

  if (!chatId) return;

  const pending = PENDING_USER_BUYS[chatId];

  if (pending?.isPending) { 
    if (!pending.mint) {
      pending.mint = message;

      return ctx.reply(
        `<b>🪙 Token Selected</b>\n\n` +
          `Mint Address:\n<code>${message}</code>\n\n` +
          `Now enter the <b>SOL amount</b> you want to spend:`,
        { parse_mode: "HTML" }
      );
    }
 
    const amountInSol = parseFloat(message);

    if (isNaN(amountInSol) || amountInSol <= 0) {
      return ctx.reply(
        `<b>⚠️ Invalid Amount</b>\n` +
          `Please enter a valid number (e.g., 0.1, 1, 2.5)`,
        { parse_mode: "HTML" }
      );
    }

    try {
      await ctx.reply("📡 Fetching swap preview…");

      const user = await prismaClient.users.findFirst({
        where: { tgUserId: chatId },
      });

      if (!user) {
        delete PENDING_USER_BUYS[chatId];
        return ctx.reply(
          `<b>⚠️ Wallet Not Found</b>\nUse /start to create a wallet.`,
          { parse_mode: "HTML" }
        );
      }

      const lamports = amountInSol * LAMPORTS_PER_SOL;

      const quote = await getQuote(
        "So11111111111111111111111111111111111111112",
        pending.mint,
        lamports
      );

      if (!quote) {
        delete PENDING_USER_BUYS[chatId];
        return ctx.reply(
          `<b>❌ Failed to fetch price quote</b>\nTry again later.`,
          { parse_mode: "HTML" }
        );
      }
 
      pending.quote = quote;
      pending.amount = lamports;
      console.log("=================QUOTE+++==>>>", quote);
      console.log("=================QUOTE+++==>>>", quote.outAmount);
      
      const solAmount = Number(quote.inAmount) / 1e9;
      const tokenAmount = Number(quote.outAmount);
      const humanAmount = await formatOutAmount(
        quote.outputMint,
        quote.outAmount
      );
      return ctx.reply(
        `<b>📊 Swap Preview</b>\n\n` +
          `<b>You Pay:</b> ${solAmount} SOL (~$${Number(
            quote.swapUsdValue
          ).toFixed(2)})\n` + 
          `You Receive: ${humanAmount.toFixed(4)} tokens \n` +
          `<b>Slippage:</b> ${(quote.slippageBps / 100).toFixed(2)}%\n` +
          `<b>Price Impact:</b> ${Number(quote.priceImpactPct).toFixed(
            2
          )}%\n\n` +
          `Confirm to continue:`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Confirm Swap", callback_data: "confirm_swap" }],
              [{ text: "❌ Cancel", callback_data: "cancel_swap" }],
            ],
          },
        }
      );
    } catch (error) {
      console.error("▶ Preview error:", error);
      delete PENDING_USER_BUYS[chatId];
      return ctx.reply(`<b>⚠️ Unexpected error</b>\nPlease try again.`, {
        parse_mode: "HTML",
      });
    }
  }
});

bot.action("account", async (ctx) => {
  const tgUserId = ctx?.chat?.id;
  if (!tgUserId) return console.log("no connection");

  const user = await prismaClient.users.findFirst({
    where: {
      tgUserId: tgUserId.toString(),
    },
  });

  return ctx.reply(
    `<b>🔐 Account Info</b>\n\n` +
      `<b>Public Key:</b> <code>${user?.publicKey}</code>\n` +
      `<b>Private Key:</b> <code>${user?.privateKey}</code>`,
    {
      parse_mode: "HTML",
      ...DEFAULT_KEYBOARD,
    }
  );
});

bot.action("confirm_swap", async (ctx) => {
  const chatId = ctx.chat?.id.toString();
  if (!chatId) return;

  const pending = PENDING_USER_BUYS[chatId];
  if (!pending?.quote) return ctx.reply("Session expired");

  const user = await prismaClient.users.findFirst({
    where: { tgUserId: chatId },
  });

  if (!user) return ctx.reply("Wallet not found. Use /start");

  ctx.reply("🔄 Executing swap…");

  const txid = await swap(pending.quote, user.publicKey, user.privateKey);

  delete PENDING_USER_BUYS[chatId];

  if (!txid) {
    return ctx.reply("❌ Swap failed. Please try again later.");
  }

  return ctx.reply(
    `<b>🎉 Swap Successful!</b>\n\n` +
      `<a href="https://solscan.io/tx/${txid}">View on Solscan 📈</a>`,
    { parse_mode: "HTML" }
  );
});

bot.action("cancel_swap", (ctx) => {
  const chatId = ctx.chat?.id.toString();
  delete PENDING_USER_BUYS[chatId!];

  ctx.reply(`<b>🚫 Swap canceled</b>\nStart again anytime with Buy button.`, {
    parse_mode: "HTML",
  });
});

bot.launch();
