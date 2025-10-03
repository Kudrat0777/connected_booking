from django.urls import path, include
from rest_framework import routers

from .views import (
    MasterViewSet, ServiceViewSet, SlotViewSet, BookingViewSet,
    portfolio_by_master, reviews_by_master, working_hours_by_master,
)

router = routers.DefaultRouter()
router.register(r'masters', MasterViewSet)
router.register(r'services', ServiceViewSet)
router.register(r'slots', SlotViewSet)
router.register(r'bookings', BookingViewSet)

urlpatterns = [
    path("", include(router.urls)),
    path("portfolio/", portfolio_by_master, name="portfolio-by-master"),
    path("reviews/", reviews_by_master, name="reviews-by-master"),
    path("masters/<int:pk>/work_hours/", working_hours_by_master, name="master-work-hours"),
]