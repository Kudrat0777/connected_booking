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

# ВСТАВЬТЕ СЮДА ТОКЕН МАСТЕР-БОТА
TOKEN = os.getenv("MASTER_BOT_TOKEN", "ВАШ_ТОКЕН_МАСТЕРА")
WEBAPP_BASE = os.getenv("WEBAPP_BASE_URL", "https://fhfhffccn14r.share.zrok.io").rstrip("/")

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] MASTER_BOT: %(message)s"
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
            "role": "master"  # <--- САМОЕ ВАЖНОЕ ОТЛИЧИЕ
        }
        params = f"?{urlencode(query)}"

    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    "✂️ Мой кабинет",
                    web_app=WebAppInfo(url=f"{WEBAPP_BASE}/{params}")
                )
            ]
        ]
    )

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = "Приветствую, Мастер! ✂️\nУправляйте своим расписанием и записями здесь."
    markup = build_markup(update)
    if update.message:
        await update.message.reply_text(text, reply_markup=markup)

async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Нажмите /start чтобы войти в кабинет.")

def main():
    app = ApplicationBuilder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))

    print("🟣 MASTER Bot started...")
    app.run_polling()

if __name__ == "__main__":
    main()