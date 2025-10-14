from django.db import models
from django.db.models import Avg, Count


class Master(models.Model):
    name = models.CharField(max_length=100)
    telegram_id = models.BigIntegerField(null=True, blank=True, unique=True)  # для панели мастера
    bio = models.TextField(blank=True, default="")
    phone = models.CharField(max_length=32, blank=True, default="")
    avatar_url = models.URLField(blank=True, default="")
    email = models.EmailField(blank=True, default="")
    experience_years = models.PositiveIntegerField(default=0)

    def __str__(self):
        return self.name

    @property
    def rating_value_prop(self):
        return self.reviews.aggregate(v=Avg("rating"))["v"] or 0.0

    @property
    def reviews_count_prop(self):
        return self.reviews.aggregate(c=Count("id"))["c"] or 0


class MasterEducation(models.Model):
    master = models.ForeignKey(Master, on_delete=models.CASCADE, related_name="education")
    title = models.CharField(max_length=255)  # "Беларусский колледж красоты (2018)"

    def __str__(self):
        return self.title


class MasterSpecialization(models.Model):
    master = models.ForeignKey(Master, on_delete=models.CASCADE, related_name="specializations")
    name = models.CharField(max_length=80)    # "Аппаратный маникюр"


class PortfolioItem(models.Model):
    master = models.ForeignKey(Master, on_delete=models.CASCADE, related_name="portfolio")
    image_url = models.URLField()
    caption = models.CharField(max_length=140, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)


class WorkingHour(models.Model):
    master = models.ForeignKey(Master, on_delete=models.CASCADE, related_name="working_hours")
    weekday = models.IntegerField()  # 0=Пн ... 6=Вс
    start = models.TimeField(null=True, blank=True)
    end = models.TimeField(null=True, blank=True)
    is_closed = models.BooleanField(default=False)


class Review(models.Model):
    master = models.ForeignKey(Master, on_delete=models.CASCADE, related_name="reviews")
    author_name = models.CharField(max_length=120)
    rating = models.IntegerField()  # 1..5
    text = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)


class Service(models.Model):
    name = models.CharField(max_length=100)
    master = models.ForeignKey(Master, on_delete=models.CASCADE)
    price = models.PositiveIntegerField(null=True, blank=True, default=None)
    duration = models.PositiveIntegerField(null=True, blank=True, help_text="минуты")
    description = models.TextField(blank=True, default="")

    def __str__(self):
        return f"{self.name} — {self.master.name}"

class Slot(models.Model):
    service = models.ForeignKey(Service, on_delete=models.CASCADE)
    time = models.DateTimeField()
    is_booked = models.BooleanField(default=False)

    class Meta:
        unique_together = ('service', 'time')  # не создаст дубликаты
        indexes = [models.Index(fields=['time'])]

    def __str__(self):
        return f"{self.service} @ {self.time:%d.%m.%Y %H:%M}"


class Booking(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Ожидание'),
        ('confirmed', 'Подтверждено'),
        ('rejected', 'Отклонено'),
    ]
    name = models.CharField(max_length=100)
    slot = models.ForeignKey(Slot, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    telegram_id = models.BigIntegerField(null=True, blank=True)
    username = models.CharField(max_length=150, null=True, blank=True)
    photo_url = models.URLField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    reminder_sent = models.BooleanField(default=False)  # клиенту
    reminder_master_sent = models.BooleanField(default=False) # мастеру

    def __str__(self):
        return f"{self.name} → {self.slot} [{self.status}]"
