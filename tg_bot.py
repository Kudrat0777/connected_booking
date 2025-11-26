import asyncio
import logging
import os
from typing import Optional

from telegram import Update, WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

TOKEN = os.getenv("TG_BOT_TOKEN", "8103172288:AAHpH5emrPsPMI30cTtMkIh8SteO2xF_AFc")
WEBAPP_BASE = os.getenv("WEBAPP_BASE_URL", "https://a3c2286b16b5.ngrok-free.app").rstrip("/")
ADMIN_ID = os.getenv("1392940334")  # optional: set to numeric string of admin user id

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

def build_markup() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("Открыть клиент", web_app=WebAppInfo(url=f"{WEBAPP_BASE}/"))],
            [InlineKeyboardButton("Панель мастера", web_app=WebAppInfo(url=f"{WEBAPP_BASE}/master/"))],
        ]
    )

# ---- Handlers ----
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = "Выбери раздел 👇"
    markup = build_markup()
    if update.message:
        await update.message.reply_text(text, reply_markup=markup)
    elif update.callback_query and update.callback_query.message:
        await update.callback_query.message.reply_text(text, reply_markup=markup)

async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("/start — меню\n/help — помощь\n/shutdown — остановить бота (admin)")

async def unauthorized_reply(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("У вас нет прав для выполнения этой команды.")

async def shutdown_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if ADMIN_ID is None or str(update.effective_user.id) != str(ADMIN_ID):
        return await unauthorized_reply(update, context)

    await update.message.reply_text("Останавливаю бота...")
    await context.application.stop()

ASK_NAME = 1

async def ask_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Как вас зовут?")
    return ASK_NAME

async def received_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    name = update.message.text.strip()
    await update.message.reply_text(f"Приятно познакомиться, {name}!")
    return ConversationHandler.END

async def cancel_conversation(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Отмена.")
    return ConversationHandler.END

async def error_handler(update: Optional[Update], context: ContextTypes.DEFAULT_TYPE):
    logger.exception("Unhandled exception occurred: %s", context.error)
    # опционально: отправить уведомление админ/сервису
    if ADMIN_ID:
        try:
            await context.bot.send_message(chat_id=int(ADMIN_ID), text=f"Ошибка: {context.error}")
        except Exception:
            logger.exception("Failed to notify admin about error")

# on startup/shutdown
async def on_startup(app):
    logger.info("Bot starting. WEBAPP_BASE=%s", WEBAPP_BASE)
    if TOKEN == "REPLACE_ME_TOKEN":
        logger.warning("Используется плейсхолдер токена. Установите TG_BOT_TOKEN в окружении.")

async def on_shutdown(app):
    logger.info("Bot shutting down. Clean up here if needed.")
    # Если есть фоновые задачи или соединения с БД/Redis, закрыть их здесь.

# ---- main ----
def main():
    app = ApplicationBuilder().token(TOKEN).post_init(on_startup).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("shutdown", shutdown_cmd))

    conv = ConversationHandler(
        entry_points=[CommandHandler("name", ask_name)],
        states={ASK_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, received_name)]},
        fallbacks=[CommandHandler("cancel", cancel_conversation)],
    )
    app.add_handler(conv)

    # error handler
    app.add_error_handler(error_handler)

    try:
        logger.info("Run polling")
        app.run_polling()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Stopped by user")
    finally:
        logger.info("Exit main")

if __name__ == "__main__":
    main()