from telegram import (
    Update, WebAppInfo,
    InlineKeyboardMarkup, InlineKeyboardButton,
    ReplyKeyboardMarkup, KeyboardButton,
    MenuButtonWebApp
)
from telegram.ext import (
    ApplicationBuilder, ContextTypes,
    CommandHandler, MessageHandler, filters
)

TOKEN = "8266390460:AAETLQKOeQRipJEXwUmJ85sFeLwuWNmDpac"
BASE  = "https://a3c2286b16b5.ngrok-free.app"

APP_NAME = "CTime"
BTN_TEXT = "Запись"
WEBAPP_URL = f"{BASE}/"

WELCOME_TEXT = (
    "Давай начнём! ⏱️\n\n"
    "Нажми кнопку ниже, чтобы выбрать мастера и записаться в удобное время."
)

def inline_markup() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(BTN_TEXT, web_app=WebAppInfo(url=WEBAPP_URL))]
    ])

def reply_markup() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [[KeyboardButton(BTN_TEXT, web_app=WebAppInfo(url=WEBAPP_URL))]],
        resize_keyboard=True, one_time_keyboard=False, is_persistent=True
    )

async def greet(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat and (update.message or update.callback_query):
        if update.message:
            await update.message.reply_text(WELCOME_TEXT, reply_markup=inline_markup())
            await update.message.reply_text(" ", reply_markup=reply_markup())
        elif update.callback_query:
            await update.callback_query.message.reply_text(WELCOME_TEXT, reply_markup=inline_markup())

async def on_startup(app):
    try:
        await app.bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text=BTN_TEXT, web_app=WebAppInfo(url=WEBAPP_URL))
        )
    except Exception as e:
        print("Menu Button setup error:", e)

def main():
    app = ApplicationBuilder().token(TOKEN).post_init(on_startup).build()
    app.add_handler(CommandHandler("start", greet))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, greet))
    app.add_handler(MessageHandler(~filters.COMMAND, greet))

    app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()