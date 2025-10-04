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
from urllib.parse import urljoin

from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import (
    Master, Service, PortfolioItem, Review, WorkingHour, Slot, Booking
)
from .serializers import (
    MasterSerializer, MasterPublicSerializer,
    ServiceShortSerializer, PortfolioSerializer, ReviewSerializer,
    WorkingHourSerializer, SlotSerializer, ServiceSerializer, BookingSerializer
)

CANCEL_LOCK_MINUTES = 30  # запрет отмены позднее чем за 30 минут

# --- отправка телеграм-сообщений ---
def send_telegram_message(chat_id: int, text: str, parse_mode="HTML") -> bool:
    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
    if not token or not chat_id:
        logging.error("TG: no token or chat_id")
        return False
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": parse_mode, "disable_web_page_preview": True},
            timeout=7,
        )
        if r.status_code != 200:
            logging.error("TG send fail %s: %s", r.status_code, r.text)
            return False
        return True
    except Exception as e:
        logging.exception("TG send exception: %s", e)
        return False


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
        media_url = getattr(settings, 'MEDIA_URL', '/media/')
        m.avatar_url = urljoin(media_url, filename.replace('\\', '/'))
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
        m = Master.objects.filter(telegram_id=tg).first()
        if not m or not name:
            return Response({'detail': 'telegram_id и name обязательны'}, status=400)
        s = Service.objects.create(master=m, name=name,
                                   price=request.data.get('price') or None,
                                   duration=request.data.get('duration') or None,
                                   description=request.data.get('description') or "")
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

    def create(self, request, *args, **kwargs):
        slot_id = request.data.get('slot') or request.data.get('slot_id')
        try:
            slot_obj = (Slot.objects
                        .select_for_update()
                        .select_related('service__master')
                        .get(pk=slot_id))
        except Slot.DoesNotExist:
            return Response({'detail': 'Слот не найден'}, status=status.HTTP_400_BAD_REQUEST)

        if slot_obj.time < timezone.now():
            return Response({'detail': 'Нельзя бронировать прошедшее время'}, status=status.HTTP_400_BAD_REQUEST)
        if slot_obj.is_booked:
            return Response({'detail': 'Слот уже занят'}, status=status.HTTP_409_CONFLICT)

        response = super().create(request, *args, **kwargs)

        if response.status_code == status.HTTP_201_CREATED:
            # помечаем слот занятым
            slot_obj.is_booked = True
            slot_obj.save(update_fields=['is_booked'])

            data = response.data
            client_tid = data.get('telegram_id')
            master = slot_obj.service.master
            service_name = slot_obj.service.name
            time_str = slot_obj.time.strftime("%d.%m.%Y %H:%M")
            client_name = request.data.get('name', '')

            def _notify_after_commit():
                # клиенту
                if client_tid:
                    send_telegram_message(
                        client_tid,
                        f"✅ Ваша запись создана\nМастер: {master.name}\nУслуга: {service_name}\nВремя: {time_str}"
                    )
                # мастеру
                if master.telegram_id:
                    send_telegram_message(
                        master.telegram_id,
                        f"🆕 Новая бронь\nУслуга: {service_name}\nВремя: {time_str}\nКлиент: {client_name}"
                    )

            transaction.on_commit(_notify_after_commit)

        return response

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
        booking.status = 'confirmed'
        booking.save(update_fields=['status'])

        def _after():
            if booking.telegram_id:
                send_telegram_message(
                    booking.telegram_id,
                    "Ваша бронь подтверждена мастером!\n"
                    f"Мастер: {booking.slot.service.master.name}\n"
                    f"Услуга: {booking.slot.service.name}\n"
                    f"Время: {booking.slot.time.strftime('%d.%m.%Y %H:%M')}"
                )
        transaction.on_commit(_after)
        return Response({'status': 'confirmed'})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        booking = self.get_object()
        booking.status = 'rejected'
        booking.save(update_fields=['status'])

        def _after():
            if booking.telegram_id:
                send_telegram_message(
                    booking.telegram_id,
                    "Ваша бронь отклонена мастером. Попробуйте выбрать другое время или услугу."
                )
        transaction.on_commit(_after)
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


class PortfolioViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = PortfolioSerializer

    def list(self, request, *args, **kwargs):
        master_id = request.query_params.get("master")
        try:
            limit = max(1, int(request.query_params.get("limit", 8)))
        except Exception:
            limit = 8
        try:
            offset = max(0, int(request.query_params.get("offset", 0)))
        except Exception:
            offset = 0

        qs = PortfolioItem.objects.select_related("master")
        if master_id:
            qs = qs.filter(master_id=master_id)
        qs = qs.order_by("-created_at")

        total = qs.count()
        page = qs[offset:offset+limit]
        data = PortfolioSerializer(page, many=True).data
        next_offset = offset + limit if (offset + limit) < total else None
        return Response({"items": data, "total": total, "next_offset": next_offset})


class ReviewViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = ReviewSerializer

    def get_queryset(self):
        master_id = self.request.query_params.get("master")
        qs = Review.objects.select_related("master").order_by("-created_at")
        if master_id:
            qs = qs.filter(master_id=master_id)
        return qs

    @action(detail=False, methods=['get'])
    def paged(self, request):
        mid = request.query_params.get("master")
        try:
            limit = max(1, int(request.query_params.get("limit", 10)))
        except Exception:
            limit = 10
        try:
            offset = max(0, int(request.query_params.get("offset", 0)))
        except Exception:
            offset = 0

        qs = self.get_queryset()
        if mid:
            qs = qs.filter(master_id=mid)

        total = qs.count()
        page = qs[offset:offset+limit]
        data = ReviewSerializer(page, many=True).data
        next_offset = offset + limit if (offset + limit) < total else None
        return Response({"items": data, "total": total, "next_offset": next_offset})