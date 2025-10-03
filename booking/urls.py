from django.urls import path, include
from rest_framework import routers

from .views import (
    MasterViewSet, ServiceViewSet, SlotViewSet, BookingViewSet,
    PortfolioViewSet, ReviewViewSet
)

router = routers.DefaultRouter()
router.register(r'masters', MasterViewSet, basename='masters')
router.register(r'services', ServiceViewSet, basename='services')
router.register(r'slots', SlotViewSet, basename='slots')
router.register(r'bookings', BookingViewSet, basename='bookings')
router.register(r'portfolio', PortfolioViewSet, basename='portfolio')
router.register(r'reviews', ReviewViewSet, basename='reviews')

urlpatterns = [
    path('', include(router.urls)),
]