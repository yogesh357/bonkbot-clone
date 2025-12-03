# 🤖 Telegram Solana Trading Bot

A powerful Telegram bot that enables users to **create Solana wallets** and **trade tokens** directly within Telegram — powered by **Jupiter Aggregator** for the best swap rates across Solana DEXs.

---

## 🚀 Features

- 🔐 Automated Solana wallet creation per user  
- 🗄️ Secure Base58 private key storage in PostgreSQL  
- 🔄 Token swapping via Jupiter API (best-price routing)  
- 💰 Real-time SOL balance lookup  
- 🧩 Button-driven interactive Telegram UI  

---

## 🛠 Tech Stack

| Layer | Tools |
|------|------|
| Backend | Node.js, TypeScript, Telegraf |
| Blockchain | Solana Web3.js, Jupiter Aggregator API |
| Database | PostgreSQL + Prisma ORM |
| RPC Provider | Helius (recommended) |

---

## 📋 Prerequisites

- Node.js **v18+**
- PostgreSQL installed
- Telegram Bot Token (from **@BotFather**)
- Solana RPC endpoint  
  _(e.g. Helius RPC URL)_

---

## ⚙️ Quick Setup

### 1️⃣ Clone & Install

```bash
git clone https://github.com/yourusername/telegram-solana-bot.git
cd telegram-solana-bot
npm install
 
