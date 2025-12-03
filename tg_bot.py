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
    ConversationHandler,
    MessageHandler,
    filters,
)

TOKEN = os.getenv("TG_BOT_TOKEN", "8266390460:AAETLQKOeQRipJEXwUmJ85sFeLwuWNmDpac")
WEBAPP_BASE = os.getenv("WEBAPP_BASE_URL", "https://f68mqm5hcxf4.share.zrok.io").rstrip("/")
ADMIN_ID = os.getenv("ADMIN_ID")  # optional: set to numeric string of admin user id

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


def build_markup(update: Optional[Update] = None) -> InlineKeyboardMarkup:
    user = update.effective_user
    client_params = ""
    master_params = ""
    if user:
        base_query = {
            "uid": user.id,
            "uname": user.username or "",
            "first_name": user.first_name or "",
            "last_name": user.last_name or "",
        }

        # Параметры для клиента
        client_params = f"?{urlencode(base_query)}"

        # Параметры для мастера (добавляем role=master)
        master_query = base_query.copy()
        master_query['role'] = 'master'
        master_params = f"?{urlencode(master_query)}"

    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    "📱 Записаться (Клиент)",
                    web_app=WebAppInfo(url=f"{WEBAPP_BASE}/{client_params}")
                )
            ],
            [
                InlineKeyboardButton(
                    "✂️ Кабинет Мастера",
                    web_app=WebAppInfo(url=f"{WEBAPP_BASE}/{master_params}")
                )
            ],
        ]
    )


# ---- Handlers ----
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = "Выбери раздел 👇"
    markup = build_markup(update)
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
    if ADMIN_ID:
        try:
            await context.bot.send_message(chat_id=int(ADMIN_ID), text=f"Ошибка: {context.error}")
        except Exception:
            logger.exception("Failed to notify admin about error")


async def on_startup(app):
    logger.info("Bot starting. WEBAPP_BASE=%s", WEBAPP_BASE)
    if TOKEN == "REPLACE_ME_TOKEN":
        logger.warning("Используется плейсхолдер токена. Установите TG_BOT_TOKEN в окружении.")


async def on_shutdown(app):
    logger.info("Bot shutting down. Clean up here if needed.")


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