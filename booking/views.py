import logging
import requests
import os
from calendar import monthrange
from datetime import datetime as dt, date as ddate, time as dtime, timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.db.models import Avg, Count, Sum
from .telegram_utils import send_telegram_message

from .models import (
    Master, Service, PortfolioImage, Review, WorkingHour, Slot, Booking, Client
)
from .serializers import (
    MasterSerializer, MasterPublicSerializer,
    ServiceShortSerializer, PortfolioImageSerializer, ReviewSerializer,
    WorkingHourSerializer, SlotSerializer, ServiceSerializer, BookingSerializer,
    ClientSerializer
)
from rest_framework.parsers import MultiPartParser, FormParser


CANCEL_LOCK_MINUTES = 30  # запрет отмены позднее чем за 30 минут

class MasterViewSet(viewsets.ModelViewSet):
    queryset = Master.objects.all()
    serializer_class = MasterSerializer

    def retrieve(self, request, *args, **kwargs):
        self.serializer_class = MasterPublicSerializer
        return super().retrieve(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def by_telegram(self, request):
        tg = request.query_params.get('telegram_id')
        if not tg:
            return Response({'exists': False})
        m = Master.objects.filter(telegram_id=tg).first()
        return Response({'exists': bool(m), 'master': MasterSerializer(m).data if m else None})

    # POST /api/masters/register/  {name, telegram_id}
    @action(detail=False, methods=['post'])
    def register(self, request):
        name = (request.data.get('name') or '').strip()
        tg = request.data.get('telegram_id')
        if not name or not tg:
            return Response({'detail': 'name and telegram_id required'}, status=400)
        m, created = Master.objects.get_or_create(telegram_id=tg, defaults={'name': name})
        if not created and m.name != name:
            m.name = name
            m.save(update_fields=['name'])
        return Response(MasterSerializer(m).data, status=201 if created else 200)

    # GET /api/masters/me/?telegram_id=...
    @action(detail=False, methods=['get'])
    def me(self, request):
        tg = request.query_params.get('telegram_id')
        m = Master.objects.filter(telegram_id=tg).first()
        if not m:
            return Response({'detail': 'not found'}, status=404)
        return Response(MasterSerializer(m).data)

    # PATCH /api/masters/me_update/
    @action(detail=False, methods=['patch'])
    def me_update(self, request):
        tg = request.data.get('telegram_id')
        m = Master.objects.filter(telegram_id=tg).first()
        if not m:
            return Response({'detail': 'not found'}, status=404)
        ser = MasterSerializer(m, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    # POST /api/masters/upload_avatar/
    @action(detail=False, methods=['post'])
    def upload_avatar(self, request):
        tg = request.data.get('telegram_id')
        f = request.FILES.get('avatar')
        if not tg or not f:
            return Response({'detail': 'telegram_id и avatar обязательны'}, status=400)

        m = Master.objects.filter(telegram_id=tg).first()
        if not m:
            return Response({'detail': 'master not found'}, status=404)

        subdir = os.path.join('avatars', str(tg))
        filename = default_storage.save(os.path.join(subdir, f.name), ContentFile(f.read()))

        base_url = os.getenv("WEBAPP_BASE_URL", "").rstrip("/")
        if not base_url:
            # Если переменной нет, берем из запроса, но заменяем 0.0.0.0 на localhost или ngrok
            host = request.get_host()
            if "0.0.0.0" in host:
                host = "127.0.0.1:8000"  # Для локального теста
            scheme = request.scheme
            base_url = f"{scheme}://{host}"

        media_url = getattr(settings, 'MEDIA_URL', '/media/')
        # Убираем двойные слеши
        full_path = f"{base_url}{media_url}{filename.replace('\\', '/')}"

        m.avatar_url = full_path
        m.save(update_fields=['avatar_url'])
        return Response({'avatar_url': m.avatar_url})

    # GET /api/masters/stats/?telegram_id=...
    @action(detail=False, methods=['get'])
    def stats(self, request):
        tg = request.query_params.get('telegram_id')
        m = Master.objects.filter(telegram_id=tg).first()
        if not m:
            return Response({'total_bookings': 0, 'experience_years': 0})

        total = Booking.objects.filter(slot__service__master=m).count()
        return Response({'total_bookings': total, 'experience_years': m.experience_years})

    # GET /api/masters/<id>/work_hours/
    @action(detail=True, methods=['get'])
    def work_hours(self, request, pk=None):
        DAYS_RU = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"]
        qs = WorkingHour.objects.filter(master_id=pk).order_by("weekday")
        raw = WorkingHourSerializer(qs, many=True).data
        out = []
        for r in raw:
            w = r["weekday"]
            out.append({
                "weekday": w,
                "day_ru": DAYS_RU[w] if 0 <= w <= 6 else "",
                "open": (r["start"] or "")[:5] if r["start"] else "",
                "close": (r["end"] or "")[:5] if r["end"] else "",
                "is_closed": r.get("is_closed", False),
            })
        return Response(out)

    @action(detail=True, methods=['get'])
    def next_slots(self, request, pk=None):
        days = int(request.query_params.get('days') or 7)
        limit = int(request.query_params.get('limit') or 24)

        now = timezone.now()
        until = now + timedelta(days=max(1, days))

        qs = (Slot.objects
        .select_related('service', 'service__master')
        .filter(service__master_id=pk,
                time__gte=now,
                time__lte=until,
                is_booked=False)
        .order_by('time')[:max(1, limit)])

        data = SlotSerializer(qs, many=True).data
        return Response({"items": data})

    # GET /api/masters/analytics/?telegram_id=...
    @action(detail=False, methods=['get'])
    def analytics(self, request):
        tg = request.query_params.get('telegram_id')
        master = Master.objects.filter(telegram_id=tg).first()
        if not master:
            return Response({'detail': 'Master not found'}, status=404)

        now = timezone.now()
        # Начало сегодняшнего дня
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        # Начало недели (понедельник)
        week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        # Начало месяца
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # Базовый запрос: только ПОДТВЕРЖДЕННЫЕ записи (деньги считаем только с них)
        qs = Booking.objects.filter(slot__service__master=master, status='confirmed')

        def get_sum(queryset):
            return queryset.aggregate(s=Sum('slot__service__price'))['s'] or 0

        revenue_today = get_sum(qs.filter(slot__time__gte=today_start))
        revenue_week = get_sum(qs.filter(slot__time__gte=week_start))
        revenue_month = get_sum(qs.filter(slot__time__gte=month_start))

        total_bookings = qs.count()
        # Уникальные клиенты
        unique_clients = qs.exclude(telegram_id__isnull=True).values('telegram_id').distinct().count()

        # Топ 3 популярных услуг
        top_services = (
            qs.values('slot__service__name')
            .annotate(count=Count('id'), revenue=Sum('slot__service__price'))
            .order_by('-count')[:3]
        )

        return Response({
            'revenue_today': revenue_today,
            'revenue_week': revenue_week,
            'revenue_month': revenue_month,
            'total_bookings': total_bookings,
            'unique_clients': unique_clients,
            'top_services': top_services
        })


class ServiceViewSet(viewsets.ModelViewSet):
    queryset = Service.objects.select_related("master").all()
    serializer_class = ServiceSerializer

    def get_queryset(self):
        master = self.request.query_params.get('master')
        if master:
            return Service.objects.select_related("master").filter(master_id=master).order_by('name')
        return super().get_queryset()

    # GET /api/services/my/?telegram_id=...
    @action(detail=False, methods=['get'])
    def my(self, request):
        tg = request.query_params.get('telegram_id')
        m = Master.objects.filter(telegram_id=tg).first()
        if not m:
            return Response([])
        qs = Service.objects.filter(master=m).order_by('name')
        return Response(ServiceSerializer(qs, many=True).data)

    # POST /api/services/create_by_master/
    @action(detail=False, methods=['post'])
    def create_by_master(self, request):
        tg = request.data.get('telegram_id')
        name = (request.data.get('name') or '').strip()

        # Обработка цены и длительности (защита от пустых строк)
        price_raw = request.data.get('price')
        duration_raw = request.data.get('duration')

        price = int(price_raw) if price_raw else None
        duration = int(duration_raw) if duration_raw else None

        m = Master.objects.filter(telegram_id=tg).first()
        if not m:
            return Response({'detail': 'Мастер не найден. Сначала зарегистрируйтесь.'}, status=404)
        if not name:
            return Response({'detail': 'Название услуги обязательно'}, status=400)

        s = Service.objects.create(
            master=m,
            name=name,
            price=price,
            duration=duration,
            description=request.data.get('description') or ""
        )
        return Response(ServiceSerializer(s).data, status=201)


class SlotViewSet(viewsets.ModelViewSet):
    queryset = Slot.objects.select_related("service", "service__master").all()
    serializer_class = SlotSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        service = self.request.query_params.get('service')
        if service:
            qs = qs.filter(service_id=service)

        include_past = self.request.query_params.get('include_past')
        if not include_past:
            qs = qs.filter(time__gte=timezone.now())

        return qs.order_by('time')

    def destroy(self, request, *args, **kwargs):
        slot = self.get_object()
        if slot.is_booked:
            return Response({'detail': 'Нельзя удалить занятый слот'}, status=400)
        return super().destroy(request, *args, **kwargs)

    # GET /api/slots/for_service/?service=...
    @action(detail=False, methods=['get'])
    def for_service(self, request):
        service = request.query_params.get('service')
        include_past = request.query_params.get('include_past')
        qs = Slot.objects.select_related("service", "service__master").filter(service_id=service)
        if not include_past:
            qs = qs.filter(time__gte=timezone.now())
        qs = qs.order_by('time')
        return Response(SlotSerializer(qs, many=True).data)

    # POST /api/slots/bulk_generate/
    @action(detail=False, methods=['post'])
    def bulk_generate(self, request):
        service_id = request.data.get('service')
        start_s = request.data.get('start_date')
        end_s   = request.data.get('end_date')
        times   = request.data.get('times', [])
        weekdays= request.data.get('weekdays', [0,1,2,3,4,5,6])

        if not (service_id and start_s and end_s and times):
            return Response({'detail':'service, start_date, end_date, times обязательны'}, status=400)

        start_d = parse_date(start_s); end_d = parse_date(end_s)
        if not start_d or not end_d or start_d > end_d:
            return Response({'detail':'Неверный диапазон дат'}, status=400)

        tz = timezone.get_current_timezone()
        created = 0
        cur = start_d
        now = timezone.now()

        while cur <= end_d:
            if cur.weekday() in weekdays:
                for t in times:
                    try:
                        hh, mm = map(int, str(t).split(':'))
                    except Exception:
                        continue
                    aware = timezone.make_aware(dt.combine(cur, dtime(hh, mm)), tz)
                    if aware < now:
                        continue
                    if not Slot.objects.filter(service_id=service_id, time=aware).exists():
                        Slot.objects.create(service_id=service_id, time=aware)
                        created += 1
            cur += timedelta(days=1)

        return Response({'created': created})

    # GET /api/slots/calendar/?telegram_id=...&year=YYYY&month=M
    @action(detail=False, methods=['get'])
    def calendar(self, request):
        tg = request.query_params.get('telegram_id')
        year = int(request.query_params.get('year') or timezone.now().year)
        month = int(request.query_params.get('month') or timezone.now().month)

        master = Master.objects.filter(telegram_id=tg).first()
        if not master:
            return Response({'days': []})

        tz = timezone.get_current_timezone()
        start = timezone.make_aware(dt(year, month, 1, 0, 0), tz)
        last_day = monthrange(year, month)[1]
        end = timezone.make_aware(dt(year, month, last_day, 23, 59, 59), tz)

        qs = (Slot.objects
              .filter(service__master=master, time__range=(start, end))
              .select_related('service', 'service__master')
              .order_by('time'))

        days = {}
        for s in qs:
            day_key = s.time.date().isoformat()
            item = {
                'id': s.id,
                'time': s.time.isoformat(),
                'service': s.service.name,
                'is_booked': s.is_booked,
            }
            if day_key not in days:
                days[day_key] = {'date': day_key, 'free': 0, 'busy': 0, 'slots': []}
            days[day_key]['slots'].append(item)
            if s.is_booked:
                days[day_key]['busy'] += 1
            else:
                days[day_key]['free'] += 1

        for day in range(1, last_day + 1):
            key = ddate(year, month, day).isoformat()
            days.setdefault(key, {'date': key, 'free': 0, 'busy': 0, 'slots': []})

        out = [days[k] for k in sorted(days.keys())]
        return Response({'year': year, 'month': month, 'days': out})


class BookingViewSet(viewsets.ModelViewSet):
    queryset = Booking.objects.select_related("slot", "slot__service", "slot__service__master").all()
    serializer_class = BookingSerializer

    def get_queryset(self):
        telegram_id = self.request.query_params.get('telegram_id')
        if telegram_id:
            return (Booking.objects
                    .select_related("slot", "slot__service", "slot__service__master")
                    .filter(telegram_id=telegram_id)
                    .order_by('-created_at'))
        return super().get_queryset()

    @action(detail=False, methods=['post'])
    def manual_create(self, request):
        slot_id = request.data.get('slot_id')
        client_name = request.data.get('client_name')

        if not slot_id or not client_name:
            return Response({"error": "Slot ID and Name are required"}, status=400)

        try:
            slot = Slot.objects.get(id=slot_id)
        except Slot.DoesNotExist:
            return Response({"error": "Slot not found"}, status=404)

        if slot.is_booked:
            return Response({"error": "Slot is already booked"}, status=400)

        booking = Booking.objects.create(
            slot=slot,
            client_name=client_name,
            status='confirmed',
            telegram_id=None
        )

        slot.is_booked = True
        slot.save()

        return Response(BookingSerializer(booking).data, status=201)

    def perform_create(self, serializer):
        booking = serializer.save()

        if booking.telegram_id:
            client = Client.objects.filter(telegram_id=booking.telegram_id).first()
            if client:
                booking.client_profile = client
                booking.save(update_fields=['client_profile'])

        # 🔔 УВЕДОМЛЕНИЕ МАСТЕРУ
        master = booking.slot.service.master
        if master.telegram_id:
            text = (
                f"🆕 <b>Новая запись!</b>\n\n"
                f"👤 Клиент: {booking.name}\n"
                f"✂️ Услуга: {booking.slot.service.name}\n"
                f"📅 Время: {booking.slot.time.strftime('%d.%m %H:%M')}\n\n"
                f"Зайдите в приложение, чтобы подтвердить."
            )
            send_telegram_message(master.telegram_id, text)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        slot = instance.slot

        if slot:
            delta_sec = (slot.time - timezone.now()).total_seconds()
            if delta_sec < CANCEL_LOCK_MINUTES * 60:
                return Response(
                    {'detail': f'Нельзя отменить позже, чем за {CANCEL_LOCK_MINUTES} минут до записи'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        client_tid = instance.telegram_id
        service_name = slot.service.name if slot and slot.service else ""
        master_name = slot.service.master.name if slot and slot.service and slot.service.master else ""
        time_str = slot.time.strftime("%d.%m.%Y %H:%M") if slot else ""

        response = super().destroy(request, *args, **kwargs)

        if response.status_code == status.HTTP_204_NO_CONTENT:
            def _after_commit():
                if slot:
                    slot.is_booked = False
                    slot.save(update_fields=['is_booked'])
                # уведомим клиента
                if client_tid:
                    send_telegram_message(
                        client_tid,
                        f"❎ Бронь отменена\nМастер: {master_name}\nУслуга: {service_name}\nВремя: {time_str}"
                    )
            transaction.on_commit(_after_commit)

        return response

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        booking = self.get_object()
        if booking.status != 'pending':
            return Response({'error': 'Booking is not pending'}, status=400)

        booking.status = 'confirmed'
        booking.save()

        # 🔔 УВЕДОМЛЕНИЕ КЛИЕНТУ
        if booking.telegram_id:
            text = (
                f"✅ <b>Запись подтверждена!</b>\n\n"
                f"Мастер {booking.slot.service.master.name} ждет вас.\n"
                f"📅 {booking.slot.time.strftime('%d.%m в %H:%M')}"
            )
            send_telegram_message(booking.telegram_id, text)

        return Response({'status': 'confirmed'})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        booking = self.get_object()
        booking.status = 'rejected'
        booking.save()
        booking.slot.is_booked = False
        booking.slot.save()

        # 🔔 УВЕДОМЛЕНИЕ КЛИЕНТУ
        if booking.telegram_id:
            text = (
                f"❌ <b>Запись отклонена</b>\n\n"
                f"Мастер {booking.slot.service.master.name} не сможет принять вас в это время.\n"
                f"Попробуйте выбрать другой слот."
            )
            send_telegram_message(booking.telegram_id, text)

        return Response({'status': 'rejected'})

    # GET /api/bookings/for_master/?telegram_id=...&period=today|tomorrow|week&status=...
    @action(detail=False, methods=['get'])
    def for_master(self, request):
        tg = request.query_params.get('telegram_id')
        if not tg:
            return Response({'items': [], 'summary': {'total': 0, 'pending': 0, 'confirmed': 0, 'rejected': 0}})

        master = Master.objects.filter(telegram_id=tg).first()
        if not master:
            return Response({'items': [], 'summary': {'total': 0, 'pending': 0, 'confirmed': 0, 'rejected': 0}})

        qs = (Booking.objects
              .filter(slot__service__master=master)
              .select_related('slot__service__master', 'slot__service'))

        period = (request.query_params.get('period') or '').lower()
        now = timezone.now()
        if period == 'today':
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=1)
            qs = qs.filter(slot__time__gte=start, slot__time__lt=end)
        elif period == 'tomorrow':
            start = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=1)
            qs = qs.filter(slot__time__gte=start, slot__time__lt=end)
        elif period == 'week':
            qs = qs.filter(slot__time__gte=now, slot__time__lt=now + timedelta(days=7))

        st = request.query_params.get('status')
        if st in ('pending', 'confirmed', 'rejected'):
            qs = qs.filter(status=st)

        qs = qs.order_by('slot__time')
        data = BookingSerializer(qs, many=True).data
        summary = {
            'total': qs.count(),
            'pending': qs.filter(status='pending').count(),
            'confirmed': qs.filter(status='confirmed').count(),
            'rejected': qs.filter(status='rejected').count(),
        }
        return Response({'items': data, 'summary': summary})


class PortfolioViewSet(viewsets.ModelViewSet):
    serializer_class = PortfolioImageSerializer
    parser_classes = (MultiPartParser, FormParser)

    def get_queryset(self):
        # Фильтруем либо по ID мастера, либо по Telegram ID
        master_id = self.request.query_params.get('master_id')
        telegram_id = self.request.query_params.get('telegram_id')

        qs = PortfolioImage.objects.all().order_by('-created_at')

        if master_id:
            return qs.filter(master_id=master_id)
        if telegram_id:
            return qs.filter(master__telegram_id=telegram_id)

        return qs.none()  # Если нет параметров, ничего не отдаем

    def perform_create(self, serializer):
        # При загрузке нужно найти мастера по telegram_id
        tg = self.request.data.get('telegram_id')
        master = Master.objects.get(telegram_id=tg)
        serializer.save(master=master)


class ReviewViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = ReviewSerializer

    def get_queryset(self):
        master_id = self.request.query_params.get("master")
        master_tg = self.request.query_params.get("master_telegram_id")

        limit = int(self.request.query_params.get("limit") or 0)
        qs = Review.objects.select_related("master").order_by("-created_at")

        if master_id:
            qs = qs.filter(master_id=master_id)

        if master_tg:
            qs = qs.filter(master__telegram_id=master_tg)

        if limit:
            qs = qs[:limit]
        return qs

    @action(detail=False, methods=['post'], permission_classes=[AllowAny], url_path='add')
    def add_review(self, request):
        """
        POST /api/reviews/add/
        body: { master: <id>, rating: 1..5, text?: str, author_name?: str, telegram_id?: int }
        Правило: у пользователя должна быть прошедшая бронь к этому мастеру.
        """
        master_id   = request.data.get('master')
        rating      = request.data.get('rating')
        text        = (request.data.get('text') or '').strip()
        author_name = (request.data.get('author_name') or '').strip() or 'Клиент'
        telegram_id = request.data.get('telegram_id')

        # базовые проверки
        try:
            rating = int(rating)
        except Exception:
            return Response({'detail': 'rating обязателен и должен быть числом 1..5'}, status=400)
        if rating < 1 or rating > 5:
            return Response({'detail': 'rating вне диапазона 1..5'}, status=400)
        if not master_id:
            return Response({'detail': 'master обязателен'}, status=400)

        # должна существовать прошедшая запись у этого клиента к этому мастеру
        if not telegram_id:
            return Response({'detail': 'telegram_id обязателен'}, status=400)

        now = timezone.now()
        had_past_booking = Booking.objects.filter(
            telegram_id=telegram_id,
            slot__service__master_id=master_id,
            slot__time__lt=now
        ).exists()
        if not had_past_booking:
            return Response({'detail': 'Отзыв можно оставить только после визита к мастеру'}, status=403)

        # опционально — антиспам: не чаще 1 отзыва в 24ч к одному мастеру
        day_ago = now - timedelta(hours=24)
        recently = Review.objects.filter(
            master_id=master_id,
            author_name=author_name,
            created_at__gte=day_ago
        ).exists()
        if recently:
            return Response({'detail': 'Вы уже оставляли отзыв недавно. Попробуйте позже.'}, status=429)

        # создаём отзыв
        rev = Review.objects.create(
            master_id=master_id,
            author_name=author_name,
            rating=rating,
            text=text
        )
        return Response(ReviewSerializer(rev).data, status=201)


class ClientViewSet(viewsets.GenericViewSet, mixins.RetrieveModelMixin, mixins.UpdateModelMixin):
    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    lookup_field = 'telegram_id'
    permission_classes = [AllowAny]  # Разрешаем доступ без токенов (пока)

    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        tid = kwargs.get('telegram_id')

        client, created = Client.objects.get_or_create(telegram_id=tid)

        serializer = self.get_serializer(client, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        return Response(serializer.data)