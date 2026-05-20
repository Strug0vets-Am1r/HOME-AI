from django.contrib import admin
from django.urls import path
from apps.core import views
from apps.core.jwt_views import CustomTokenObtainPairView
from apps.core.jwt_views import CustomTokenRefreshView
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)


urlpatterns = [
    path('admin/', admin.site.urls),

    # OpenAPI / Swagger (требование описания проекта)
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    path('health', views.health_check, name='health'),

    # SSR-страницы (как в репозитории GitHub)
    path('', views.home, name='home'),
    path('calendar/', views.calendar, name='calendar'),
    path('register/', views.register, name='register'),
    path('login/', views.user_login, name='login'),
    path('logout/', views.user_logout, name='logout'),
    path('survey/', views.survey, name='survey'),
    path('profile/', views.profile, name='profile'),

    path('task/create/', views.task_create, name='task_create'),
    path('task/<int:task_id>/edit/', views.task_edit, name='task_edit'),
    path('task/<int:task_id>/delete/', views.task_delete, name='task_delete'),
    path('task/<int:task_id>/complete/', views.complete_task, name='complete_task'),
    path('task/<int:task_id>/restore/', views.restore_task, name='restore_task'),
    path('tasks/clear-completed/', views.clear_completed_tasks, name='clear_completed_tasks'),
    path('tasks/update-overdue/', views.update_overdue_tasks, name='update_overdue_tasks'),

    path(
        'task/<int:task_id>/generate-subtasks/',
        views.generate_subtasks_view,
        name='generate_subtasks_view',
    ),
    path('subtask/<int:subtask_id>/toggle/', views.toggle_subtask, name='toggle_subtask'),
    path('suggestions/', views.suggestions_page, name='suggestions'),

    # REST API
    path('api/tasks/', views.api_tasks, name='api_tasks'),
    path('api/tasks-data/', views.api_tasks_data, name='api_tasks_data'),
    path('api/tasks/<int:task_id>/subtasks/', views.api_task_subtasks, name='api_task_subtasks'),
    path('api/generate-subtasks/', views.api_generate_subtasks, name='api_generate_subtasks'),
    path(
        'api/subtasks/status/<str:task_id>/',
        views.api_subtask_status,
        name='api_subtask_status',
    ),
    path('api/suggestions/', views.suggestions_api, name='suggestions_api'),
    path('api/suggestions/create/', views.api_create_suggestion, name='api_create_suggestion'),

    path('api/pages/home/', views.api_home, name='api_home'),
    path('api/pages/calendar/', views.api_calendar, name='api_calendar'),
    path('api/pages/profile/', views.api_profile, name='api_profile'),
    path('api/survey/', views.api_survey, name='api_survey'),

    # JWT
    path('api/token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', CustomTokenRefreshView.as_view(), name='token_refresh'),
]
