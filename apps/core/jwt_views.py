"""
JWT Views для кастомной аутентификации
"""
from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from django.http import JsonResponse
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from .models import User
from .auth_cookies import set_jwt_cookies


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Кастомный сериализатор для JWT токенов"""
    
    def validate(self, attrs):
        """Валидация и создание токенов"""
        authenticate_kwargs = {
            self.username_field: attrs[self.username_field],
            'password': attrs['password'],
        }
        
        try:
            self.user = authenticate(**authenticate_kwargs)
        except AuthenticationFailed:
            raise AuthenticationFailed(
                'Неверное имя пользователя или пароль',
                code='invalid_credentials'
            )
        
        if not self.user:
            raise AuthenticationFailed(
                'Неверное имя пользователя или пароль',
                code='invalid_credentials'
            )
        
        if not self.user.is_active:
            raise AuthenticationFailed(
                'Пользователь деактивирован',
                code='user_inactive'
            )
        
        # Обновляем время последнего входа
        update_last_login(None, self.user)
        
        data = {}
        refresh = self.get_token(self.user)
        
        data['refresh'] = str(refresh)
        data['access'] = str(refresh.access_token)
        
        # Добавляем информацию о пользователе
        data['user'] = {
            'id': self.user.id,
            'username': self.user.username,
            'email': self.user.email,
            'first_name': self.user.first_name,
            'last_name': self.user.last_name,
            'gender': self.user.gender,
            'is_survey_completed': self.user.is_survey_completed,
        }
        
        return data


class CustomTokenObtainPairView(TokenObtainPairView):
    """Кастомный view для получения JWT токенов"""
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            set_jwt_cookies(
                response,
                response.data.get('access'),
                response.data.get('refresh'),
            )
        return response


class CustomTokenRefreshView(TokenRefreshView):
    """Обновление access-токена + cookie для SSR."""

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            refresh = None
            if hasattr(request, 'data'):
                refresh = request.data.get('refresh')
            if not refresh:
                refresh = request.COOKIES.get('refresh_token')
            set_jwt_cookies(response, response.data.get('access'), refresh)
        return response
