from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from datetime import timedelta
from booking.models import Booking
from booking.views import send_telegram_message
from django.conf import settings

DEFAULT_CLIENT_MIN = 60     # за сколько минут слать клиенту
DEFAULT_MASTER_MIN = 60     # мастеру можно тоже 60
WINDOW_MIN = 5              # ширина окна проверки

class Command(BaseCommand):
    help = "Send upcoming booking reminders to clients and masters"

    def add_arguments(self, parser):
        parser.add_argument('--loop', action='store_true', help='Run forever (every WINDOW_MIN)')

    def handle(self, *args, **opts):
        def run_once():
            now = timezone.now()

            # --- Клиентам ---
            client_from = now + timedelta(minutes=DEFAULT_CLIENT_MIN)
            client_to   = client_from + timedelta(minutes=WINDOW_MIN)

            qs_client = (Booking.objects
                .filter(status__in=['pending','confirmed'],
                        reminder_sent=False,
                        slot__time__gte=client_from,
                        slot__time__lt=client_to)
                .select_related('slot__service__master', 'slot__service'))

            for b in qs_client:
                tid = b.telegram_id
                if not tid:
                    b.reminder_sent = True; b.save(update_fields=['reminder_sent']); continue
                service = b.slot.service.name
                master  = b.slot.service.master.name
                time_str= b.slot.time.strftime("%d.%m.%Y %H:%M")
                txt = f"⏰ Напоминание: запись через {DEFAULT_CLIENT_MIN} мин.\nМастер: {master}\nУслуга: {service}\nВремя: {time_str}"
                if send_telegram_message(tid, txt):
                    b.reminder_sent = True
                    b.save(update_fields=['reminder_sent'])

            # --- Мастерам ---
            master_from = now + timedelta(minutes=DEFAULT_MASTER_MIN)
            master_to   = master_from + timedelta(minutes=WINDOW_MIN)

            qs_master = (Booking.objects
                .filter(status__in=['pending','confirmed'],
                        reminder_master_sent=False,
                        slot__time__gte=master_from,
                        slot__time__lt=master_to)
                .select_related('slot__service__master', 'slot__service'))

            for b in qs_master:
                mtid = b.slot.service.master.telegram_id if b.slot and b.slot.service and b.slot.service.master else None
                if not mtid:
                    b.reminder_master_sent = True; b.save(update_fields=['reminder_master_sent']); continue
                service = b.slot.service.name
                time_str= b.slot.time.strftime("%d.%m.%Y %H:%M")
                txt = f"🔔 Напоминание мастеру: запись через {DEFAULT_MASTER_MIN} мин.\nУслуга: {service}\nВремя: {time_str}\nКлиент: {b.name}"
                if send_telegram_message(mtid, txt):
                    b.reminder_master_sent = True
                    b.save(update_fields=['reminder_master_sent'])

        if opts['loop']:
            import time
            while True:
                run_once()
                time.sleep(WINDOW_MIN * 60)
        else:
            run_once()
