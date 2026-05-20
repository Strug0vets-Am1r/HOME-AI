"""Аутентификация по JWT из Authorization или cookie (для SSR после входа через frontend)."""
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken

from .auth_cookies import ACCESS_COOKIE

User = get_user_model()


class JWTAuthMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        self._authenticate_jwt(request)
        return self.get_response(request)

    def _authenticate_jwt(self, request):
        token = None
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:].strip()
        if not token:
            token = request.COOKIES.get(ACCESS_COOKIE)
        if not token:
            return
        try:
            validated = AccessToken(token)
            user_id = validated.get('user_id')
            if user_id is None:
                return
            user = User.objects.get(pk=user_id)
            if user.is_active:
                request.user = user
        except (InvalidToken, TokenError, User.DoesNotExist, TypeError, ValueError):
            return
