from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.cache import never_cache
from django.contrib import messages
from django.utils import timezone
from django.http import JsonResponse
from django.db.models import Count, Prefetch, Q
from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User, Task, TaskHistory, RecurringSuggestion
from .forms import TaskForm, ProfileForm

import datetime
import json
import os
import requests
import traceback
import redis as redis_lib


def _publish_task_event(event_type, data):
    try:
        r = redis_lib.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=settings.REDIS_DB,
            decode_responses=True
        )
        r.publish('homeai:events', json.dumps({
            'type': event_type,
            'data': data,
        }))
        r.close()
    except Exception:
        pass


def _redirect_back(request, fallback='home'):
    host = request.get_host()
    next_url = request.POST.get('next') or request.META.get('HTTP_REFERER', '')
    if next_url and host in next_url:
        return redirect(next_url)
    return redirect(fallback)


@never_cache
def register(request):
    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        first_name = request.POST.get('first_name', '').strip()
        last_name = request.POST.get('last_name', '').strip()
        email = request.POST.get('email', '').strip()
        gender = request.POST.get('gender', '')
        password = request.POST.get('password')
        password2 = request.POST.get('password2')

        if password != password2:
            messages.error(request, 'Пароли не совпадают')
            return render(request, 'core/register.html', {'post': request.POST})

        if len(password) < 8:
            messages.error(request, 'Пароль должен содержать минимум 8 символов')
            return render(request, 'core/register.html', {'post': request.POST})

        if User.objects.filter(username=username).exists():
            messages.error(request, 'Пользователь с таким именем уже существует')
            return render(request, 'core/register.html', {'post': request.POST})

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            gender=gender or None,
        )

        login(request, user)
        return redirect('survey')

    return render(request, 'core/register.html')


@never_cache
def user_login(request):
    if request.user.is_authenticated:
        return redirect('home')
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)

        if user is not None:
            login(request, user)
            return redirect('home')

        messages.error(request, 'Неверное имя пользователя или пароль')

    return render(request, 'core/login.html')


def user_logout(request):
    logout(request)
    response = redirect('login')
    from .auth_cookies import clear_jwt_cookies
    clear_jwt_cookies(response)
    return response


@login_required
def profile(request):
    if request.method == 'POST':
        form = ProfileForm(request.POST, instance=request.user)
        if form.is_valid():
            form.save()
            messages.success(request, 'Профиль обновлён!')
            return redirect('profile')
    else:
        form = ProfileForm(instance=request.user)

    return render(request, 'core/profile.html', {
        'form': form,
        'title': 'Профиль'
    })


@login_required
def api_profile(request):
    """API endpoint для данных профиля пользователя"""
    return JsonResponse({
        'user': {
            'id': request.user.id,
            'username': request.user.username,
            'email': request.user.email,
            'gender': request.user.gender,
            'first_name': request.user.first_name,
            'last_name': request.user.last_name,
            'is_survey_completed': request.user.is_survey_completed,
            'room_count': request.user.room_count,
            'cleaning_frequency': request.user.cleaning_frequency,
            'has_dishwasher': request.user.has_dishwasher,
            'has_robot_vacuum': request.user.has_robot_vacuum,
            'has_plants': request.user.has_plants,
            'has_pets': request.user.has_pets,
        }
    })


@csrf_exempt
def api_survey(request):
    """API опроса: GET — статус, POST — сохранить ответы и создать стартовые задачи."""
    if not request.user.is_authenticated:
        return JsonResponse({'detail': 'Требуется авторизация'}, status=401)

    if request.method == 'GET':
        return JsonResponse({
            'is_survey_completed': request.user.is_survey_completed,
            'username': request.user.username,
        })

    if request.method != 'POST':
        return JsonResponse({'detail': 'Method not allowed'}, status=405)

    if request.user.is_survey_completed:
        return JsonResponse({
            'detail': 'Опрос уже пройден',
            'is_survey_completed': True,
        }, status=400)

    try:
        data = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        return JsonResponse({'detail': 'Некорректный JSON'}, status=400)

    cleaning = data.get('cleaning_frequency')
    if cleaning not in ('daily', 'weekly', 'monthly'):
        return JsonResponse({'detail': 'Выберите частоту уборки'}, status=400)

    user = request.user
    user.has_dishwasher = bool(data.get('has_dishwasher'))
    user.has_robot_vacuum = bool(data.get('has_robot_vacuum'))
    user.has_plants = bool(data.get('has_plants'))
    user.has_pets = bool(data.get('has_pets'))

    room_count = data.get('room_count')
    if room_count is not None and str(room_count).strip() != '':
        try:
            user.room_count = int(room_count)
        except (TypeError, ValueError):
            return JsonResponse({'detail': 'Некорректное количество комнат'}, status=400)

    user.cleaning_frequency = cleaning
    user.is_survey_completed = True
    user.save()

    generate_initial_tasks(user)

    return JsonResponse({
        'ok': True,
        'message': 'Спасибо! Ваши задачи созданы.',
        'is_survey_completed': True,
    })


def survey(request):
    if not request.user.is_authenticated:
        return redirect('register')

    if request.user.is_survey_completed:
        return redirect('home')

    if request.method == 'POST':
        user = request.user
        user.has_dishwasher = request.POST.get('has_dishwasher') == 'on'
        user.has_robot_vacuum = request.POST.get('has_robot_vacuum') == 'on'
        user.has_plants = request.POST.get('has_plants') == 'on'
        user.has_pets = request.POST.get('has_pets') == 'on'

        room_count = request.POST.get('room_count')
        if room_count:
            user.room_count = int(room_count)

        user.cleaning_frequency = request.POST.get('cleaning_frequency')
        user.is_survey_completed = True
        user.save()

        generate_initial_tasks(user)

        messages.success(request, 'Спасибо! Ваши задачи созданы.')
        return redirect('home')

    return render(request, 'core/survey.html')


def generate_initial_tasks(user):
    now = timezone.localtime()
    remainder = now.minute % 5
    delta = (5 - remainder) if remainder else 5
    base = (now + datetime.timedelta(minutes=delta)).replace(second=0, microsecond=0)
    base_utc = timezone.localtime(base, timezone.utc)

    tasks = [
        {
            'title': 'Вынести мусор',
            'due_date': base_utc + datetime.timedelta(days=1)
        },
        {
            'title': 'Протереть пыль',
            'due_date': base_utc + datetime.timedelta(days=2)
        },
    ]

    if user.has_dishwasher:
        tasks.append({
            'title': 'Загрузить посудомойку и запустить',
            'due_date': base_utc + datetime.timedelta(days=1)
        })

    if user.has_robot_vacuum:
        tasks.append({
            'title': 'Запустить робот-пылесос',
            'due_date': base_utc + datetime.timedelta(days=1)
        })

    if user.has_plants:
        tasks.append({
            'title': 'Полить растения',
            'due_date': base_utc + datetime.timedelta(days=3)
        })

    if user.has_pets:
        tasks.append({
            'title': 'Покормить питомца',
            'due_date': base_utc + datetime.timedelta(hours=12)
        })
        tasks.append({
            'title': 'Убрать за питомцем',
            'due_date': base_utc + datetime.timedelta(days=1)
        })

    if user.cleaning_frequency == 'daily':
        tasks.append({
            'title': 'Влажная уборка',
            'due_date': base_utc + datetime.timedelta(days=1)
        })
    elif user.cleaning_frequency == 'weekly':
        tasks.append({
            'title': 'Влажная уборка',
            'due_date': base_utc + datetime.timedelta(days=7)
        })

    for task_data in tasks:
        Task.objects.create(
            user=user,
            title=task_data['title'],
            due_date=task_data['due_date']
        )


@login_required
def home(request):
    now = timezone.now()
    today = now.date()

    # Автоматически обновляем просроченные задачи
    Task.objects.filter(
        user=request.user,
        is_completed=False,
        parent_task__isnull=True,
        due_date__date__lt=today,
        task_list__in=['active', 'planned', 'urgent']
    ).update(task_list='overdue')

    # Обновляем выполненные задачи чтобы task_list='completed'
    Task.objects.filter(
        user=request.user,
        is_completed=True,
        parent_task__isnull=True,
        task_list__in=['active', 'planned', 'urgent', 'favorites']
    ).update(task_list='completed')

    all_tasks = Task.objects.filter(
        user=request.user,
        parent_task__isnull=True
    ).annotate(
        pending_subtask_count=Count('subtasks', filter=Q(subtasks__is_completed=False))
    ).prefetch_related(
        Prefetch(
            'subtasks',
            queryset=Task.objects.filter(user=request.user).order_by('due_date', 'id')
        )
    ).order_by('due_date')

    active_tasks = [t for t in all_tasks if not t.is_completed and t.task_list == 'active']
    urgent_tasks = [t for t in all_tasks if not t.is_completed and t.task_list == 'urgent']
    planned_tasks = [t for t in all_tasks if not t.is_completed and t.task_list == 'planned']
    overdue_tasks = [t for t in all_tasks if not t.is_completed and t.task_list == 'overdue']
    completed_tasks = [t for t in all_tasks if t.is_completed]

    return render(request, 'core/home.html', {
        'tasks': active_tasks + urgent_tasks + planned_tasks + overdue_tasks,
        'completed_tasks': completed_tasks,
        'today': now,
    })


@login_required
def api_home(request):
    """API endpoint для данных главной страницы"""
    now = timezone.now()

    # Автоматически обновляем просроченные задачи
    today = now.date()
    Task.objects.filter(
        user=request.user,
        is_completed=False,
        parent_task__isnull=True,
        due_date__date__lt=today,
        task_list__in=['active', 'planned', 'urgent']
    ).update(task_list='overdue')

    # Обновляем выполненные задачи чтобы task_list='completed'
    Task.objects.filter(
        user=request.user,
        is_completed=True,
        parent_task__isnull=True,
        task_list__in=['active', 'planned', 'urgent', 'favorites']
    ).update(task_list='completed')

    all_tasks = Task.objects.filter(
        user=request.user,
        parent_task__isnull=True
    ).annotate(
        pending_subtask_count=Count('subtasks', filter=Q(subtasks__is_completed=False))
    ).prefetch_related(
        Prefetch(
            'subtasks',
            queryset=Task.objects.filter(user=request.user).order_by('due_date', 'id')
        )
    ).order_by('due_date')

    active_tasks = [t for t in all_tasks if not t.is_completed and t.task_list == 'active']
    urgent_tasks = [t for t in all_tasks if not t.is_completed and t.task_list == 'urgent']
    planned_tasks = [t for t in all_tasks if not t.is_completed and t.task_list == 'planned']
    overdue_tasks = [t for t in all_tasks if not t.is_completed and t.task_list == 'overdue']
    completed_tasks = [t for t in all_tasks if t.is_completed]
    favorites_tasks = [t for t in all_tasks if not t.is_completed and t.is_favorite]

    def serialize_task(task):
        return {
            'id': task.id,
            'title': task.title,
            'description': task.description or '',
            'due_date': task.due_date.isoformat() if task.due_date else None,
            'is_completed': task.is_completed,
            'task_list': task.task_list,
            'is_favorite': task.is_favorite,
            'pending_subtask_count': task.pending_subtask_count,
            'subtasks': [
                {
                    'id': sub.id,
                    'title': sub.title,
                    'is_completed': sub.is_completed
                }
                for sub in task.subtasks.all()
            ]
        }

    return JsonResponse({
        'tasks': [serialize_task(t) for t in active_tasks + urgent_tasks + planned_tasks + overdue_tasks],
        'completed_tasks': [serialize_task(t) for t in completed_tasks],
        'counts': {
            'suggestions': len(favorites_tasks),
            'active': len(active_tasks),
            'planned': len(planned_tasks),
            'favorites': len(favorites_tasks),
            'urgent': len(urgent_tasks),
            'overdue': len(overdue_tasks),
            'completed': len(completed_tasks)
        },
        'today': now.isoformat(),
    })


@login_required
def calendar(request):
    return render(request, 'core/calendar.html')


@login_required
def api_calendar(request):
    """API endpoint для данных календаря"""
    tasks = Task.objects.filter(
        user=request.user,
        parent_task__isnull=True
    ).order_by('due_date')
    
    def serialize_task(task):
        return {
            'id': task.id,
            'title': task.title,
            'description': task.description or '',
            'due_date': task.due_date.isoformat() if task.due_date else None,
            'is_completed': task.is_completed,
            'task_list': task.task_list,
            'is_favorite': task.is_favorite,
        }
    
    return JsonResponse({
        'tasks': [serialize_task(t) for t in tasks],
    })


@csrf_exempt
@login_required
def complete_task(request, task_id):
    try:
        task = Task.objects.get(
            id=task_id,
            user=request.user,
            parent_task__isnull=True
        )
    except Task.DoesNotExist:
        messages.error(request, 'Задача не найдена.')
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({'status': 'error', 'message': 'Задача не найдена'}, status=404)
        return redirect('home')

    # Сохраняем исходный список перед выполнением
    task.original_task_list = task.task_list
    task.task_list = 'completed'
    task.is_completed = True
    task.save(update_fields=['is_completed', 'task_list', 'original_task_list', 'updated_at'])

    TaskHistory.objects.create(
        user=request.user,
        task_title=task.title,
        task_list=task.task_list,
    )

    _publish_task_event('task.completed', {
        'user_id': request.user.id,
        'task_id': task.id,
        'task_title': task.title,
        'task_list': task.task_list,
    })

    messages.success(request, f'Задача "{task.title}" выполнена!')
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({'status': 'success', 'message': f'Задача "{task.title}" выполнена!'})
    
    return _redirect_back(request)


@csrf_exempt
@login_required
def restore_task(request, task_id):
    try:
        task = Task.objects.get(
            id=task_id,
            user=request.user,
            parent_task__isnull=True,
            is_completed=True
        )
    except Task.DoesNotExist:
        messages.error(request, 'Задача для восстановления не найдена.')
        return redirect('home')

    # Возвращаем задачу в исходный список
    task.task_list = task.original_task_list or 'active'
    task.is_completed = False
    task.save(update_fields=['is_completed', 'task_list', 'updated_at'])

    _publish_task_event('task.restored', {
        'user_id': request.user.id,
        'task_id': task.id,
        'task_title': task.title,
        'task_list': task.task_list,
    })

    messages.success(request, f'Задача "{task.title}" снова активна!')
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({'status': 'success', 'message': f'Задача "{task.title}" снова активна!'})
    
    return _redirect_back(request)


@csrf_exempt
@login_required
def toggle_subtask(request, subtask_id):
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Method not allowed'}, status=405)

    subtask = get_object_or_404(
        Task,
        id=subtask_id,
        user=request.user,
        parent_task__isnull=False
    )

    subtask.is_completed = not subtask.is_completed
    subtask.save(update_fields=['is_completed', 'updated_at'])

    pending_count = Task.objects.filter(
        parent_task_id=subtask.parent_task_id,
        is_completed=False
    ).count()

    return JsonResponse({
        'status': 'success',
        'subtask_id': subtask.id,
        'parent_task_id': subtask.parent_task_id,
        'is_completed': subtask.is_completed,
        'pending_count': pending_count,
        'message': 'Статус подзадачи обновлён.'
    })


@csrf_exempt
@login_required
def clear_completed_tasks(request):
    if request.method == 'POST':
        deleted_count, _ = Task.objects.filter(
            user=request.user,
            is_completed=True
        ).delete()

        if deleted_count > 0:
            _publish_task_event('tasks.cleared', {
                'user_id': request.user.id,
                'count': deleted_count,
            })
            messages.success(request, 'Выполненные задачи очищены.')
        else:
            messages.info(request, 'Нет выполненных задач для очистки.')

    return _redirect_back(request)


@csrf_exempt
@login_required
def update_overdue_tasks(request):
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Method not allowed'}, status=405)

    today = timezone.now().date()

    updated_count = Task.objects.filter(
        user=request.user,
        is_completed=False,
        parent_task__isnull=True,
        due_date__date__lt=today,
        task_list__in=['active', 'planned', 'urgent']
    ).update(task_list='overdue')

    return JsonResponse({
        'status': 'success',
        'updated_count': updated_count
    })


@login_required
def api_tasks_data(request):
    now = timezone.now()

    # Автоматически обновляем просроченные задачи
    today = timezone.now().date()
    Task.objects.filter(
        user=request.user,
        is_completed=False,
        parent_task__isnull=True,
        due_date__date__lt=today,
        task_list__in=['active', 'planned', 'urgent']
    ).update(task_list='overdue')

    # Обновляем выполненные задачи чтобы task_list='completed'
    Task.objects.filter(
        user=request.user,
        is_completed=True,
        parent_task__isnull=True,
        task_list__in=['active', 'planned', 'urgent', 'favorites']
    ).update(task_list='completed')

    all_tasks = Task.objects.filter(
        user=request.user,
        parent_task__isnull=True
    ).annotate(
        pending_subtask_count=Count('subtasks', filter=Q(subtasks__is_completed=False))
    ).prefetch_related(
        Prefetch(
            'subtasks',
            queryset=Task.objects.filter(user=request.user).order_by('due_date', 'id')
        )
    ).order_by('due_date')

    tasks_list = []
    completed_list = []

    for task in all_tasks:
        local_due = timezone.localtime(task.due_date)
        task_data = {
            'id': task.id,
            'title': task.title,
            'description': task.description or '',
            'due_date': local_due.isoformat(),
            'due_date_display': local_due.strftime('%d.%m.%Y %H:%M'),
            'is_completed': task.is_completed,
            'is_favorite': task.is_favorite,
            'task_list': task.task_list,
            'pending_subtask_count': task.pending_subtask_count,
            'subtasks': [
                {
                    'id': st.id,
                    'title': st.title,
                    'is_completed': st.is_completed
                }
                for st in task.subtasks.all()
            ]
        }

        if task.is_completed:
            completed_list.append(task_data)
        else:
            tasks_list.append(task_data)

    today = now.date()

    counters = {
        'active_count': Task.objects.filter(user=request.user, is_completed=False, parent_task__isnull=True, task_list='active', due_date__date__gte=today).count(),
        'urgent_count': Task.objects.filter(user=request.user, is_completed=False, parent_task__isnull=True, task_list='urgent', due_date__date__gte=today).count(),
        'planned_count': Task.objects.filter(user=request.user, is_completed=False, parent_task__isnull=True, task_list='planned', due_date__date__gte=today).count(),
        'completed_count': Task.objects.filter(user=request.user, is_completed=True, parent_task__isnull=True).count(),
        'overdue_count': Task.objects.filter(user=request.user, is_completed=False, parent_task__isnull=True, due_date__date__lt=today).count(),
        'favorites_count': Task.objects.filter(user=request.user, is_completed=False, parent_task__isnull=True, is_favorite=True).count(),
        'suggestions_count': RecurringSuggestion.objects.filter(user=request.user, status='pending').count(),
    }

    return JsonResponse({
        'status': 'success',
        'tasks': tasks_list,
        'completed_tasks': completed_list,
        'now': now.isoformat(),
        'counters': counters,
    })


def _normalize_subtask_title(value):
    return ' '.join((value or '').strip().split())


def _deduplicate_subtasks(subtasks, max_count=10):
    seen = set()
    result = []

    for subtask in subtasks:
        normalized = _normalize_subtask_title(subtask)
        if not normalized:
            continue

        key = normalized.lower().rstrip('.,!?:;')
        if key in seen:
            continue

        seen.add(key)
        result.append(normalized)

        if len(result) >= max_count:
            break

    return result


@login_required
@never_cache
def task_create(request):
    if request.method == 'POST':
        form = TaskForm(request.POST, user=request.user)
        if form.is_valid():
            task = form.save(commit=False)
            task.user = request.user

            task_list = request.POST.get('task_list', 'active')
            task.task_list = task_list

            is_favorite = request.POST.get('is_favorite', 'off') == 'on'
            task.is_favorite = is_favorite

            task.save()

            subtasks = request.POST.getlist('subtasks')
            subtasks = _deduplicate_subtasks(subtasks, max_count=10)

            for subtask_title in subtasks:
                Task.objects.create(
                    user=request.user,
                    title=subtask_title,
                    description='',
                    due_date=task.due_date,
                    parent_task=task,
                    task_list=task.task_list
                )

            _publish_task_event('task.created', {
                'user_id': request.user.id,
                'task_id': task.id,
                'task_title': task.title,
                'task_list': task.task_list,
            })

            messages.success(request, f'Задача "{task.title}" создана!')
            return _redirect_back(request)
    else:
        form = TaskForm(user=request.user)

    return render(request, 'core/task_form.html', {
        'form': form,
        'title': 'Создать задачу',
        'next': request.META.get('HTTP_REFERER', ''),
    })


@login_required
@never_cache
def task_edit(request, task_id):
    task = get_object_or_404(Task, id=task_id, user=request.user)

    if request.method == 'POST':
        form = TaskForm(request.POST, instance=task, user=request.user)
        if form.is_valid():
            task = form.save(commit=False)

            task_list = request.POST.get('task_list', 'active')
            task.task_list = task_list

            is_favorite = request.POST.get('is_favorite', 'off') == 'on'
            task.is_favorite = is_favorite

            task.save()

            submitted_subtasks = _deduplicate_subtasks(
                request.POST.getlist('subtasks'),
                max_count=10
            )
            existing_subtasks = list(task.subtasks.filter(user=request.user).order_by('id'))

            for existing in existing_subtasks:
                existing.delete()

            for subtask_title in submitted_subtasks:
                Task.objects.create(
                    user=request.user,
                    title=subtask_title,
                    description='',
                    due_date=task.due_date,
                    parent_task=task
                )

            _publish_task_event('task.updated', {
                'user_id': request.user.id,
                'task_id': task.id,
                'task_title': task.title,
                'task_list': task.task_list,
            })

            messages.success(request, f'Задача "{task.title}" обновлена!')
            return _redirect_back(request)
    else:
        form = TaskForm(instance=task, user=request.user)

    return render(request, 'core/task_form.html', {
        'form': form,
        'title': 'Редактировать задачу',
        'task': task,
        'next': request.META.get('HTTP_REFERER', ''),
    })


@csrf_exempt
@login_required
def task_delete(request, task_id):
    task = get_object_or_404(Task, id=task_id, user=request.user)
    title = task.title

    _publish_task_event('task.deleted', {
        'user_id': request.user.id,
        'task_id': task.id,
        'task_title': title,
    })
    task.delete()
    messages.success(request, f'Задача "{title}" удалена!')
    return _redirect_back(request)


@login_required
def api_tasks(request):
    tasks = Task.objects.filter(
        user=request.user,
        parent_task__isnull=True,
    ).annotate(
        pending_subtask_count=Count('subtasks', filter=Q(subtasks__is_completed=False))
    )

    events = []
    for task in tasks:
        local_due = timezone.localtime(task.due_date)
        events.append({
            'id': task.id,
            'title': task.title,
            'description': task.description or '',
            'date': local_due.strftime('%Y-%m-%d'),
            'time': local_due.strftime('%H:%M'),
            'is_completed': task.is_completed,
            'pending_subtasks': task.pending_subtask_count,
            'edit_url': f'/task/{task.id}/edit/',
            'complete_url': f'/task/{task.id}/complete/',
            'task_list': task.task_list,
            'delete_url': f'/task/{task.id}/delete/',
            'is_favorite': task.is_favorite,
        })

    return JsonResponse(events, safe=False)


@login_required
def api_task_subtasks(request, task_id):
    try:
        task = Task.objects.get(id=task_id, user=request.user, parent_task__isnull=True)
    except Task.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Task not found'}, status=404)

    subtasks = task.subtasks.filter(user=request.user).order_by('due_date', 'id').values(
        'id', 'title', 'is_completed'
    )

    return JsonResponse({
        'status': 'success',
        'subtasks': list(subtasks)
    })


def health_check(request):
    """Health check для Nginx и мониторинга."""
    return JsonResponse({
        'status': 'ok',
        'service': 'task-service',
    })


@login_required
def generate_subtasks_view(request, task_id):
    """POST /task/<id>/generate-subtasks/ — совместимость с GitHub."""
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Method not allowed'}, status=405)

    task = get_object_or_404(Task, id=task_id, user=request.user)
    from .tasks import generate_subtasks_via_ml_service

    result = generate_subtasks_via_ml_service.delay(
        task_id=task.id,
        task_title=task.title,
        task_description=task.description or '',
        user_gender=request.user.gender,
        user_id=request.user.id,
    )
    return JsonResponse({
        'status': 'pending',
        'task_id': result.id,
        'message': 'Генерация подзадач запущена. Ожидайте...',
    })


def api_subtask_status(request, task_id):
    """
    API для проверки статуса асинхронной задачи генерации подзадач
    """
    # Используем request.user для авторизации (сессии)
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({'status': 'error', 'message': 'Требуется авторизация'}, status=401)
    
    from celery.result import AsyncResult
    from .tasks import generate_subtasks_via_ml_service

    result = AsyncResult(task_id, app=generate_subtasks_via_ml_service)

    if result.state == 'PENDING':
        return JsonResponse({
            'status': 'pending',
            'message': 'Генерация в процессе...'
        })
    elif result.state == 'SUCCESS':
        return JsonResponse({
            'status': 'success',
            'result': result.result
        })
    elif result.state == 'FAILURE':
        return JsonResponse({
            'status': 'error',
            'message': str(result.info)
        }, status=500)
    else:
        return JsonResponse({
            'status': result.state,
            'message': 'Неизвестный статус'
        })


@csrf_exempt
def api_generate_subtasks(request):
    import logging
    import json
    logger = logging.getLogger(__name__)
    
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        logger.info(f'Generate subtasks request data: {data}')
    except Exception as e:
        logger.error(f'JSON parse error: {e}')
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON'}, status=400)

    task_title = (data.get('task_title') or '').strip()
    task_description = (data.get('task_description') or '').strip()
    task_id = data.get('task_id')
    
    logger.info(f'User authenticated: {request.user.is_authenticated}, User: {request.user}')

    if not task_title:
        return JsonResponse({'status': 'error', 'message': 'task_title is required'}, status=400)

    try:
        # Проверяем наличие task_id и получаем родительскую задачу
        if task_id:
            try:
                parent_task = Task.objects.get(id=task_id, user=request.user)
            except Task.DoesNotExist:
                return JsonResponse({
                    'status': 'error',
                    'message': 'Родительская задача не найдена.'
                }, status=404)

            # Обновляем описание если нужно
            if task_description and not parent_task.description:
                parent_task.description = task_description
                parent_task.save(update_fields=['description'])

            # Используем request.user для авторизации (сессии)
            user = request.user
            if not user.is_authenticated:
                return JsonResponse({'status': 'error', 'message': 'Требуется авторизация'}, status=401)

            # ВРЕМЕННО: Синхронная генерация для теста (polling не работает)
            try:
                from .tasks import generate_subtasks_via_ml_service
                result = generate_subtasks_via_ml_service(
                    task_id=parent_task.id,
                    task_title=parent_task.title,
                    task_description=parent_task.description or '',
                    user_gender=user.gender,
                    user_id=user.id
                )
                # После успешной генерации возвращаем подзадачи
                from django.core.serializers.json import DjangoJSONEncoder
                import json
                subtasks = list(parent_task.subtasks.filter(user=user).values('id', 'title', 'is_completed'))
                return JsonResponse({
                    'status': 'success',
                    'subtasks': subtasks,
                    'message': 'Подзадачи успешно сгенерированы'
                })
            except Exception as e:
                return JsonResponse({
                    'status': 'error',
                    'message': str(e)
                }, status=500)
        else:
            # Если нет task_id, генерируем синхронно через ml_service (для быстрого API)
            ml_service_url = os.getenv('ML_SERVICE_URL', 'http://localhost:8002')
            response = requests.post(
                f'{ml_service_url}/api/subtasks/generate',
                json={
                    'task_title': task_title,
                    'task_description': task_description,
                    'user_gender': request.user.gender,
                    'user_id': request.user.id
                },
                timeout=60
            )

            if response.status_code != 200:
                raise Exception(f'ML service error: {response.status_code}')

            data = response.json()

            if not data.get('success'):
                raise Exception(f'ML service failed: {data.get("error")}')

            return JsonResponse({
                'status': 'success',
                'subtasks': data.get('subtasks', []),
                'cached': data.get('cached', False),
                'message': 'Подзадачи успешно сгенерированы.'
            })

    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e),
            'trace': traceback.format_exc()
        }, status=500)


@login_required
def suggestions_page(request):
    suggestions = RecurringSuggestion.objects.filter(user=request.user, status='pending')
    return render(request, 'core/suggestions.html', {
        'suggestions': suggestions,
    })





@login_required
def suggestions_api(request):
    """
    API для получения активных предложений пользователя (JSON).
    GET: возвращает список предложений со статусом 'pending'.
    POST: обрабатывает ответ пользователя (accept/reject).
    """
    if request.method == 'GET':
        suggestions = RecurringSuggestion.objects.filter(
            user=request.user,
            status='pending'
        ).values('id', 'title', 'interval_days')
        return JsonResponse({'suggestions': list(suggestions)})

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            suggestion_id = data.get('suggestion_id')
            action = data.get('action')  # 'accept' или 'reject'

            suggestion = get_object_or_404(
                RecurringSuggestion,
                id=suggestion_id,
                user=request.user
            )

            if action == 'accept':
                # Определяем task_list из истории (мода — самое частое значение)
                from django.db.models import Count
                task_list_counts = TaskHistory.objects.filter(
                    user=request.user,
                    task_title__iexact=suggestion.title,
                ).values('task_list').annotate(cnt=Count('id')).order_by('-cnt')
                best_task_list = 'active'
                if task_list_counts:
                    best_task_list = task_list_counts[0]['task_list'] or 'active'

                Task.objects.create(
                    user=request.user,
                    title=suggestion.title,
                    description=f'Автоматически добавлено из предложения (каждые {suggestion.interval_days} дн.)',
                    due_date=timezone.now(),
                    task_list=best_task_list,
                )

                title = suggestion.title
                suggestion.delete()
                return JsonResponse({'ok': True, 'message': f'Задача «{title}» добавлена!'})

            elif action == 'reject':
                suggestion.delete()
                return JsonResponse({'ok': True, 'message': 'Предложение отклонено'})

            return JsonResponse({'error': 'Неизвестное действие'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)


@csrf_exempt
def api_create_suggestion(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
    except Exception:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    user_id = data.get('user_id')
    title = (data.get('title') or '').strip()
    interval_days = data.get('interval_days')

    if not user_id or not title or not interval_days:
        return JsonResponse({'error': 'user_id, title, interval_days required'}, status=400)

    from .models import RecurringSuggestion
    exists = RecurringSuggestion.objects.filter(
        user_id=user_id,
        title__iexact=title,
        status='pending'
    ).exists()
    if exists:
        return JsonResponse({'ok': False, 'error': 'already_exists'}, status=409)

    RecurringSuggestion.objects.create(
        user_id=user_id,
        title=title,
        interval_days=interval_days,
    )
    return JsonResponse({'ok': True, 'message': 'Предложение создано'})