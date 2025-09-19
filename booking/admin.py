from django.contrib import admin, messages
from django import forms
from django.utils import timezone
from .models import Master, Service, Slot, Booking
from datetime import datetime, timedelta

class SlotInline(admin.TabularInline):
    model = Slot
    extra = 0
    fields = ("time", "is_booked")
    ordering = ("time",)


@admin.register(Master)
class MasterAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "telegram_id")
    search_fields = ("name", "telegram_id")
    list_filter = ()
    ordering = ("id",)


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "master")
    list_filter = ("master",)
    search_fields = ("name", "master__name")

    @admin.action(description="Сгенерировать слоты…")
    def generate_slots(self, request, queryset):
        if 'apply' in request.POST:
            form = GenerateSlotsForm(request.POST)
            if form.is_valid():
                cd = form.cleaned_data
                tz = timezone.get_current_timezone()
                cnt = 0
                for service in queryset:
                    d = cd['start_date']
                    while d <= cd['end_date']:
                        if not cd['weekdays'] or str(d.weekday()) in cd['weekdays']:
                            t = datetime.combine(d, cd['start_time'])
                            endt = datetime.combine(d, cd['end_time'])
                            cur = tz.localize(t)
                            end_dt = tz.localize(endt)
                            while cur <= end_dt - timedelta(minutes=cd['interval_min']):
                                # создаём или пропускаем, если уже есть
                                _, created = Slot.objects.get_or_create(service=service, time=cur)
                                if created: cnt += 1
                                cur += timedelta(minutes=cd['interval_min'])
                        d += timedelta(days=1)
                self.message_user(request, f"Создано слотов: {cnt}", level=messages.SUCCESS)
                return
        else:
            form = GenerateSlotsForm()

        from django.shortcuts import render
        return render(request, 'admin/generate_slots.html', context={
            'title': 'Сгенерировать слоты',
            'services': queryset,
            'form': form,
            'action_checkbox_name': admin.helpers.ACTION_CHECKBOX_NAME,
        })


@admin.register(Slot)
class SlotAdmin(admin.ModelAdmin):
    list_display = ("id", "service", "service_master", "time", "is_booked")
    list_filter = ("service__master", "service", "is_booked")
    search_fields = ("service__name", "service__master__name")
    ordering = ("-time",)
    autocomplete_fields = ("service",)

    @admin.display(description="Мастер")
    def service_master(self, obj):
        return obj.service.master if obj.service else "-"


@admin.action(description="Пометить как подтверждено")
def mark_confirmed(modeladmin, request, queryset):
    queryset.update(status="confirmed")

@admin.action(description="Пометить как отклонено")
def mark_rejected(modeladmin, request, queryset):
    queryset.update(status="rejected")


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = (
        "id", "name", "slot_time", "service_name", "master_name",
        "status", "telegram_id", "created_at"
    )
    list_filter = ("status", "slot__service__master")
    search_fields = ("name", "telegram_id", "slot__service__name", "slot__service__master__name")
    readonly_fields = ("created_at",)
    date_hierarchy = "created_at"
    actions = [mark_confirmed, mark_rejected]
    list_select_related = ("slot__service__master", "slot__service")

    @admin.display(description="Время")
    def slot_time(self, obj):
        return obj.slot.time if obj.slot else "-"

    @admin.display(description="Услуга")
    def service_name(self, obj):
        return obj.slot.service.name if obj.slot and obj.slot.service else "-"

    @admin.display(description="Мастер")
    def master_name(self, obj):
        return obj.slot.service.master.name if obj.slot and obj.slot.service else "-"


class GenerateSlotsForm(forms.Form):
    start_date   = forms.DateField(label="С даты")
    end_date     = forms.DateField(label="По дату")
    start_time   = forms.TimeField(label="Начало (время)", initial="10:00")
    end_time     = forms.TimeField(label="Конец (время)", initial="20:00")
    interval_min = forms.IntegerField(label="Интервал, мин", initial=30, min_value=5)
    weekdays     = forms.MultipleChoiceField(
        label="Дни недели",
        required=False,
        choices=[(i, w) for i,w in enumerate(["Пн","Вт","Ср","Чт","Пт","Сб","Вс"])],
        help_text="Если пусто — все дни"
    )