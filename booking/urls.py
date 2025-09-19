from rest_framework import routers
from .views import MasterViewSet, ServiceViewSet, SlotViewSet, BookingViewSet

router = routers.DefaultRouter()
router.register(r'masters', MasterViewSet)
router.register(r'services', ServiceViewSet)
router.register(r'slots', SlotViewSet)
router.register(r'bookings', BookingViewSet)

urlpatterns = router.urls
