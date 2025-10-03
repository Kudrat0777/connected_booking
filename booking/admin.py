from django.contrib import admin
from django.utils.safestring import mark_safe
from django.db.models.fields.related import ManyToManyRel, ManyToManyField

from . import models

def has_field(model, name: str) -> bool:
    try:
        model._meta.get_field(name)
        return True
    except Exception:
        return False

def is_m2m(model, name: str) -> bool:
    try:
        f = model._meta.get_field(name)
        return isinstance(f, ManyToManyField) or isinstance(f, ManyToManyRel)
    except Exception:
        return False


class WorkingHourInline(admin.TabularInline):
    model = getattr(models, "WorkingHour", None)
    extra = 0
    fields = ("weekday", "start", "end", "is_closed") if model else ()
    ordering = ("weekday",)

class PortfolioItemInline(admin.TabularInline):
    model = getattr(models, "PortfolioItem", None)
    extra = 0
    fields = ("image", "caption", "created_at") if model else ()
    readonly_fields = ("created_at",) if model else ()

class ReviewInline(admin.TabularInline):
    model = getattr(models, "Review", None)
    extra = 0
    fields = ("author_name", "rating", "text", "created_at") if model else ()
    readonly_fields = ("created_at",) if model else ()
    ordering = ("-created_at",)

class SlotInline(admin.TabularInline):
    model = getattr(models, "Slot", None)
    extra = 0
    fields = ("time", "is_booked") if model else ()
    ordering = ("time",)
    show_change_link = True


@admin.register(models.Master)
class MasterAdmin(admin.ModelAdmin):
    list_display = tuple(f for f in ("id", "name", "experience_years", "phone", "email", "telegram_id") if has_field(models.Master, f))
    search_fields = tuple(f for f in ("name", "phone", "email", "telegram_id") if has_field(models.Master, f))
    list_filter   = tuple(f for f in ("experience_years",) if has_field(models.Master, f))

    inlines = [x for x in (
        PortfolioItemInline if getattr(models, "PortfolioItem", None) else None,
        WorkingHourInline   if getattr(models, "WorkingHour", None) else None,
        ReviewInline        if getattr(models, "Review", None) else None
    ) if x]

    filter_horizontal = ("specializations",) if is_m2m(models.Master, "specializations") else ()

    base_profile = [f for f in ("name", "bio", "avatar") if has_field(models.Master, f)]
    contacts     = [f for f in ("phone", "email", "telegram_id") if has_field(models.Master, f)]
    extra_block  = [f for f in ("experience_years", "specializations") if has_field(models.Master, f)]

    readonly_fields = ()
    if "avatar" in base_profile:
        readonly_fields = ("avatar_preview",)
        base_profile.append("avatar_preview")

    fieldsets = (
        ("Профиль", {"fields": tuple(base_profile)}),
        ("Контакты", {"fields": tuple(contacts)}),
        ("Опыт и специализация", {"fields": tuple(extra_block)}),
    )

    def avatar_preview(self, obj):
        if hasattr(obj, "avatar") and obj.avatar:
            return mark_safe(f'<img src="{obj.avatar.url}" style="height:80px;border-radius:8px" />')
        return "—"
    avatar_preview.short_description = "Превью"


if hasattr(models, "MasterSpecialization"):
    @admin.register(models.MasterSpecialization)
    class SpecializationAdmin(admin.ModelAdmin):
        list_display  = ("id", "name")
        search_fields = ("name",)

if hasattr(models, "PortfolioItem"):
    @admin.register(models.PortfolioItem)
    class PortfolioItemAdmin(admin.ModelAdmin):
        list_display  = ("id", "master", "caption", "created_at")
        list_filter   = ("master",)
        search_fields = ("caption", "master__name")
        readonly_fields = ("created_at",)

if hasattr(models, "WorkingHour"):
    @admin.register(models.WorkingHour)
    class WorkingHourAdmin(admin.ModelAdmin):
        list_display  = ("id", "master", "weekday", "start", "end", "is_closed")
        list_filter   = ("master", "weekday", "is_closed")
        ordering      = ("master", "weekday")


_service_list = ["id", "name", "master"]
if has_field(models.Service, "price"):
    _service_list.append("price")
else:
    _service_list.append("price_display")
if has_field(models.Service, "duration"):
    _service_list.append("duration")
else:
    _service_list.append("duration_display")

@admin.register(models.Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display  = tuple(_service_list)
    list_filter   = ("master",) if has_field(models.Service, "master") else ()
    search_fields = ("name", "master__name")
    inlines       = [SlotInline]

    def price_display(self, obj):
        return getattr(obj, "price", "—")
    price_display.short_description = "Цена"

    def duration_display(self, obj):
        return getattr(obj, "duration", "—")
    duration_display.short_description = "Длительность"


@admin.register(models.Slot)
class SlotAdmin(admin.ModelAdmin):
    list_display  = tuple(f for f in ("id", "service", "time", "is_booked") if has_field(models.Slot, f))
    list_filter   = ("service__master", "service", "is_booked")
    search_fields = ("service__name",)
    if has_field(models.Slot, "time"):
        date_hierarchy = "time"
        ordering = ("-time",)


@admin.register(models.Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display  = ("id", "slot", "client_name", "status", "created_at")
    list_filter   = ("status", "slot__service__master", "slot__service")
    search_fields = ("client_name", "telegram_id", "username", "slot__service__name")
    readonly_fields = ("created_at",) if has_field(models.Booking, "created_at") else ()
    ordering     = ("-created_at",)

    def client_name(self, obj):
        for f in ("name", "client_name"):
            if hasattr(obj, f):
                return getattr(obj, f)
        return "—"
    client_name.short_description = "Клиент"


admin.site.site_header = "Панель управления Connected Booking"
admin.site.site_title  = "Connected Booking"
admin.site.index_title = "Администрирование"