from django.db import models

class Master(models.Model):
    name = models.CharField(max_length=100)
    telegram_id = models.BigIntegerField(null=True, blank=True, unique=True)  # для панели мастера
    bio = models.TextField(blank=True, default="")
    phone = models.CharField(max_length=32, blank=True, default="")
    avatar_url = models.URLField(blank=True, default="")

    def __str__(self):
        return self.name

class Service(models.Model):
    name = models.CharField(max_length=100)
    master = models.ForeignKey(Master, on_delete=models.CASCADE)

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
