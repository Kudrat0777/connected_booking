from rest_framework import serializers
from django.db.models import Avg, Count
from .models import (
    Master, Service, Slot, Booking,
    MasterEducation, MasterSpecialization, PortfolioItem, WorkingHour, Review
)

class MasterSerializer(serializers.ModelSerializer):
    rating = serializers.SerializerMethodField()
    reviews_count = serializers.SerializerMethodField()

    def get_rating(self, obj):
        # если queryset уже аннотировал rating_value — используем его,
        # иначе считаем на лету или берём из property rating_value_prop
        val = getattr(obj, "rating_value", None)
        if val is None:
            val = getattr(obj, "rating_value_prop", None)
        if val is None:
            val = Review.objects.filter(master=obj).aggregate(avg=Avg("rating"))["avg"]
        return round(val or 0.0, 1)

    def get_reviews_count(self, obj):
        val = getattr(obj, "reviews_count", None)
        if val is None:
            val = getattr(obj, "reviews_count_prop", None)
        if val is None:
            val = Review.objects.filter(master=obj).count()
        return int(val or 0)

    class Meta:
        model = Master
        fields = ("id","name","telegram_id","bio","phone","avatar_url",
                  "email","experience_years","rating","reviews_count")

class ServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = "__all__"

class ServiceShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = ["id", "name", "price", "duration", "description"]

class SlotSerializer(serializers.ModelSerializer):
    service = ServiceSerializer(read_only=True)
    service_id = serializers.PrimaryKeyRelatedField(
        queryset=Service.objects.all(), source='service', write_only=True
    )
    class Meta:
        model = Slot
        fields = '__all__'

class BookingSerializer(serializers.ModelSerializer):
    slot = SlotSerializer(read_only=True)
    slot_id = serializers.PrimaryKeyRelatedField(
        queryset=Slot.objects.all(), source='slot', write_only=True
    )
    class Meta:
        model = Booking
        fields = (
            'id', 'name', 'slot', 'slot_id', 'created_at',
            'telegram_id', 'username', 'photo_url', 'status'
        )

class EducationSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterEducation
        fields = ["title"]

class SpecSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterSpecialization
        fields = ["name"]

class PortfolioSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioItem
        fields = ["image_url", "caption", "created_at"]

class WorkingHourSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkingHour
        fields = ["weekday", "start", "end", "is_closed"]

class ReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Review
        fields = ["author_name", "rating", "text", "created_at"]

class MasterPublicSerializer(serializers.ModelSerializer):
    services = ServiceShortSerializer(many=True, read_only=True, source="service_set")
    education = EducationSerializer(many=True, read_only=True)
    specializations = SpecSerializer(many=True, read_only=True)
    portfolio = PortfolioSerializer(many=True, read_only=True)
    working_hours = WorkingHourSerializer(many=True, read_only=True)
    rating = serializers.SerializerMethodField()
    reviews_count = serializers.SerializerMethodField()
    clients_count = serializers.SerializerMethodField()

    def get_rating(self, obj):
        val = getattr(obj, "rating_value", None)
        if val is None:
            val = getattr(obj, "rating_value_prop", None)
        if val is None:
            val = Review.objects.filter(master=obj).aggregate(avg=Avg("rating"))["avg"]
        return round(val or 0.0, 2)

    def get_reviews_count(self, obj):
        val = getattr(obj, "reviews_count", None)
        if val is None:
            val = getattr(obj, "reviews_count_prop", None)
        if val is None:
            val = Review.objects.filter(master=obj).count()
        return int(val or 0)

    def get_clients_count(self, obj):
        qs = Booking.objects.filter(slot__service__master=obj)
        return qs.values('telegram_id', 'name').distinct().count()

    class Meta:
        model = Master
        fields = [
            "id", "name", "avatar_url", "bio", "experience_years",
            "rating", "reviews_count", "clients_count",
            "services", "education", "specializations", "portfolio", "working_hours"
        ]