"""HttpOnly cookies для JWT (SSR-страницы Django читают access_token)."""
from django.conf import settings

ACCESS_COOKIE = 'access_token'
REFRESH_COOKIE = 'refresh_token'


def set_jwt_cookies(response, access, refresh=None):
    if not access:
        return response
    access_lifetime = settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME']
    max_age = int(access_lifetime.total_seconds())
    response.set_cookie(
        ACCESS_COOKIE,
        access,
        max_age=max_age,
        httponly=True,
        samesite='Lax',
        path='/',
    )
    if refresh:
        refresh_lifetime = settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME']
        refresh_max = int(refresh_lifetime.total_seconds())
        response.set_cookie(
            REFRESH_COOKIE,
            refresh,
            max_age=refresh_max,
            httponly=True,
            samesite='Lax',
            path='/',
        )
    return response


def clear_jwt_cookies(response):
    response.delete_cookie(ACCESS_COOKIE, path='/')
    response.delete_cookie(REFRESH_COOKIE, path='/')
    return response
