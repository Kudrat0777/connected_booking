import requests
from django.conf import settings


def send_telegram_message(chat_id, text):
    """
    Отправляет текстовое сообщение пользователю через Telegram Bot API.
    """
    if not chat_id:
        return

    token = settings.TELEGRAM_BOT_TOKEN
    url = f"https://api.telegram.org/bot{token}/sendMessage"

    data = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML"
    }

    try:
        requests.post(url, data=data, timeout=5)
    except Exception as e:
        print(f"Error sending Telegram message: {e}")