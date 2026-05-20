from celery import shared_task
from django.utils import timezone
from django.conf import settings
import redis as redis_lib
import json
import datetime
import requests
import os

from .models import Task


def _publish_task_event(event_type, data):
    try:
        r = redis_lib.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=settings.REDIS_DB,
            decode_responses=True
        )
        r.publish('homeai:events', json.dumps({'type': event_type, 'data': data}))
        r.close()
    except Exception:
        pass


@shared_task
def send_task_reminders():
    now = timezone.now()
    window_start = now + datetime.timedelta(minutes=25)
    window_end = now + datetime.timedelta(minutes=35)

    upcoming_tasks = Task.objects.filter(
        is_completed=False,
        parent_task__isnull=True,
        due_date__gte=window_start,
        due_date__lte=window_end,
    )

    r = redis_lib.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        db=settings.REDIS_DB,
        decode_responses=True
    )

    sent = 0
    for task in upcoming_tasks:
        reminder_key = f'reminder_sent:{task.id}'
        if r.get(reminder_key):
            continue
        _publish_task_event('task.reminder', {
            'user_id': task.user_id,
            'task_id': task.id,
            'task_title': task.title,
            'due_date': task.due_date.isoformat(),
        })
        r.setex(reminder_key, 3600, '1')
        sent += 1

    r.close()
    return f'Sent {sent} reminders'


@shared_task
def update_overdue_tasks():
    """
    Автоматически обновляет task_list в 'overdue' для просроченных задач
    """
    now = timezone.now()
    
    # Находим незавершенные задачи с просроченной датой
    overdue_tasks = Task.objects.filter(
        is_completed=False,
        due_date__lt=now,
        task_list__in=['active', 'planned', 'urgent', 'favorites']
    )
    
    updated_count = 0
    for task in overdue_tasks:
        task.task_list = 'overdue'
        task.save(update_fields=['task_list'])
        updated_count += 1
    
    return f'Updated {updated_count} tasks to overdue'


@shared_task
def generate_subtasks_via_ml_service(task_id, task_title, task_description, user_gender, user_id):
    """
    Celery task для генерации подзадач через ml_service
    """
    ml_service_url = os.getenv('ML_SERVICE_URL', 'http://localhost:8002')
    
    try:
        response = requests.post(
            f'{ml_service_url}/api/subtasks/generate',
            json={
                'task_title': task_title,
                'task_description': task_description,
                'user_gender': user_gender,
                'user_id': user_id
            },
            timeout=60
        )
        
        if response.status_code != 200:
            raise Exception(f'ML service error: {response.status_code}')
        
        data = response.json()
        
        if not data.get('success'):
            raise Exception(f'ML service failed: {data.get("error")}')
        
        subtasks = data.get('subtasks', [])
        
        # Сохраняем подзадачи в БД
        if task_id:
            try:
                from .models import Task
                parent_task = Task.objects.get(id=task_id)
                
                existing_titles = {
                    item.title.strip().lower()
                    for item in parent_task.subtasks.all()
                }
                
                created_count = 0
                for subtask_title in subtasks:
                    if subtask_title.strip().lower() in existing_titles:
                        continue
                    
                    Task.objects.create(
                        user=parent_task.user,
                        title=subtask_title.strip(),
                        parent_task=parent_task,
                        due_date=parent_task.due_date,
                        task_list=parent_task.task_list
                    )
                    created_count += 1
                
                # Публикуем событие
                _publish_task_event('subtask.generated', {
                    'user_id': user_id,
                    'task_id': task_id,
                    'task_title': task_title,
                    'subtask_count': created_count
                })
                
                return {'success': True, 'created': created_count}
                
            except Task.DoesNotExist:
                raise Exception('Parent task not found')
        
        return {'success': True, 'subtasks': subtasks}
        
    except Exception as e:
        _publish_task_event('subtask.failed', {
            'user_id': user_id,
            'task_id': task_id,
            'error': str(e)
        })
        raise
