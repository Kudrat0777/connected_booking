from django.contrib import admin
from django.utils.safestring import mark_safe
from . import models

class MasterEducationInline(admin.TabularInline):
    model = models.MasterEducation
    extra = 0
    fields = ("title",)

class MasterSpecializationInline(admin.TabularInline):
    model = models.MasterSpecialization
    extra = 0
    fields = ("name",)

class PortfolioItemInline(admin.TabularInline):
    model = models.PortfolioImage
    extra = 1
    fields = ("image", "created_at")
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)

class WorkingHourInline(admin.TabularInline):
    model = models.WorkingHour
    extra = 0
    fields = ("weekday", "start", "end", "is_closed")
    ordering = ("weekday",)

class ReviewInline(admin.TabularInline):
    model = models.Review
    extra = 0
    fields = ("author_name", "rating", "text", "created_at")
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)

@admin.register(models.Master)
class MasterAdmin(admin.ModelAdmin):
    list_display  = ("id", "name", "experience_years", "phone", "email", "telegram_id")
    search_fields = ("name", "phone", "email", "telegram_id")
    list_filter   = ("experience_years",)

    fieldsets = (
        ("Профиль", {
            "fields": ("name", "bio", "avatar_url", "avatar_preview")
        }),
        ("Контакты", {
            "fields": ("phone", "email", "telegram_id")
        }),
        ("Опыт", {
            "fields": ("experience_years",)
        }),
    )
    readonly_fields = ("avatar_preview",)

    inlines = [
        MasterEducationInline,
        MasterSpecializationInline,
        PortfolioItemInline,
        WorkingHourInline,
        ReviewInline,
    ]

    def avatar_preview(self, obj):
        # Проверка на None
        url = getattr(obj, "avatar_url", "") or ""
        if url:
            return mark_safe(f'<img src="{url}" style="height:80px;border-radius:8px" />')
        return "—"
    avatar_preview.short_description = "Превью"

class SlotInline(admin.TabularInline):
    model = models.Slot
    extra = 0
    fields = ("time", "is_booked")
    ordering = ("time",)

@admin.register(models.Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display  = ("id", "name", "master")
    list_filter   = ("master",)
    search_fields = ("name", "master__name")
    inlines = [SlotInline]

@admin.register(models.Slot)
class SlotAdmin(admin.ModelAdmin):
    list_display  = ("id", "service", "time", "is_booked")
    list_filter   = ("service__master", "service", "is_booked")
    search_fields = ("service__name",)
    date_hierarchy = "time"
    ordering = ("-time",)

@admin.register(models.Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display  = ("id", "slot", "client_name", "status", "created_at")
    list_filter   = ("status", "slot__service__master", "slot__service")
    search_fields = ("client_name", "telegram_id", "username", "slot__service__name")
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)

    def client_name(self, obj):
        return getattr(obj, "name", None) or getattr(obj, "client_name", "—")
    client_name.short_description = "Клиент"

@admin.register(models.PortfolioImage)
class PortfolioImageAdmin(admin.ModelAdmin):
    list_display = ('master', 'image', 'created_at')
    list_filter = ('master',)