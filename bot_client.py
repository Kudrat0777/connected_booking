import asyncio
import logging
import os
from typing import Optional
from urllib.parse import urlencode

from telegram import Update, WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
)

# ВСТАВЬТЕ СЮДА ТОКЕН КЛИЕНТСКОГО БОТА
TOKEN = os.getenv("CLIENT_BOT_TOKEN", "8266390460:AAETLQKOeQRipJEXwUmJ85sFeLwuWNmDpac")
WEBAPP_BASE = os.getenv("WEBAPP_BASE_URL", "https://fhfhffccn14r.share.zrok.io").rstrip("/")

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] CLIENT_BOT: %(message)s"
)
logger = logging.getLogger(__name__)

def build_markup(update: Optional[Update] = None) -> InlineKeyboardMarkup:
    user = update.effective_user
    params = ""
    if user:
        query = {
            "uid": user.id,
            "uname": user.username or "",
            "first_name": user.first_name or "",
            "last_name": user.last_name or "",
        }
        params = f"?{urlencode(query)}"

    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    "📱 Открыть CTime",
                    web_app=WebAppInfo(url=f"{WEBAPP_BASE}/{params}")
                )
            ]
        ]
    )

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = "Добро пожаловать в CTime! 🌟\nНажмите кнопку ниже, чтобы записаться к мастеру."
    markup = build_markup(update)
    if update.message:
        await update.message.reply_text(text, reply_markup=markup)

async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Нажмите /start чтобы открыть приложение.")

def main():
    app = ApplicationBuilder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))

    print("🟢 CLIENT Bot started...")
    app.run_polling()

if __name__ == "__main__":
    main()