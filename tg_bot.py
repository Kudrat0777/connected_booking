from telegram import Update, KeyboardButton, ReplyKeyboardMarkup, WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

TOKEN = "8103172288:AAHpH5emrPsPMI30cTtMkIh8SteO2xF_AFc"
BASE  = "https://a3c2286b16b5.ngrok-free.app"

async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    kb = InlineKeyboardMarkup([  # <-- INLINE!
        [InlineKeyboardButton("Открыть клиент",  web_app=WebAppInfo(url=f"{BASE}/"))],
        [InlineKeyboardButton("Панель мастера",  web_app=WebAppInfo(url=f"{BASE}/master/"))],
    ])
    await update.message.reply_text("Выбери раздел 👇", reply_markup=kb)


app = ApplicationBuilder().token(TOKEN).build()
app.add_handler(CommandHandler("start", start))
app.run_polling()
