# Home AI

Веб-помощник для планирования домашних дел с использованием нейросетевых технологий и распределенной архитектуры микросервисов.

## Архитектура

Проект использует распределенную архитектуру из микросервисов:

- task-service (Django + DRF) - REST API, бизнес-логика, SSR
- ai-service (FastAPI) - Нейросеть YandexGPT, генерация подзадач
- notification-service (FastAPI) - WebSocket уведомления
- suggestion-service (FastAPI) - Анализ повторяющихся задач
- celery-worker/beat (Celery) - Асинхронные задачи
- nginx - API Gateway
- postgres - База данных
- redis - Брокер сообщений

## Быстрый старт

```bash
cp .env.example .env
# Заполните YANDEX_FOLDER_ID, YANDEX_API_KEY, YANDEX_MODEL_URI

docker compose up -d --build
docker compose exec task-service python manage.py createsuperuser
```

Откройте: http://localhost

## Основные функции

1. Опрос при старте - интерактивный опрос пользователя для создания персонализированного набора задач на основе предпочтений и образа жизни
2. Нейросеть - автоматическое разбиение сложной задачи на подзадачи с использованием YandexGPT для улучшения планирования
3. Предложения задач - система создания повторяющихся задач на основе истории с возможностью ручного подтверждения
4. Управление задачами - полная система управления задачами с категориями, календарем, избранными и отслеживанием просроченных задач
5. Уведомления - система уведомлений в реальном времени через WebSocket для оперативного информирования пользователя
6. Генерация подзадач - асинхронная генерация подзадач через Celery для эффективной обработки запросов

## Технологии

Python, Django 4.2, Django REST Framework, FastAPI, Celery, Redis, PostgreSQL, Docker Compose, YandexGPT.

## API Документация

Swagger: http://localhost/api/docs/
OpenAPI Schema: http://localhost/api/schema/
