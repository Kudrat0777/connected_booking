from rest_framework import serializers
from .models import Master, Service, Slot, Booking

class MasterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Master
        fields = ("id","name","telegram_id","bio","phone","avatar_url")

class ServiceSerializer(serializers.ModelSerializer):
    master = MasterSerializer(read_only=True)

    class Meta:
        model = Service
        fields = '__all__'

class SlotSerializer(serializers.ModelSerializer):
    service = ServiceSerializer(read_only=True)

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
