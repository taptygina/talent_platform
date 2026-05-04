# Запуск проекта в Docker

## Что поднимается
- `db` — PostgreSQL 16
- `backend` — Django API (`http://localhost:8000`)
- `frontend` — Nginx со статикой из `frontend/dist` (`http://localhost:5173`)

## Быстрый старт (для защиты)
1. В корне проекта соберите фронтенд:
   - `cd frontend`
   - `npm install`
   - `npm run build`
2. Вернитесь в корень проекта:
   - `cd ..`
3. (Опционально) задайте SMTP пароль:
   - PowerShell: `$env:SMTP_PASSWORD="ВАШ_APP_ПАРОЛЬ"`
4. Поднимите контейнеры:
   - `docker compose up --build -d`
5. Полностью очистите и заполните БД демо-данными:
   - `docker compose exec backend python manage.py reset_and_seed_demo`

## Полная очистка БД
- `docker compose down -v`

## Остановка
- `docker compose down`

## Демо-доступы после сидирования
- пароль для всех пользователей: `Demo12345`
- логины:
  - `admin`
  - `curator`
  - `method`
  - `t01..t06` (преподаватели)
  - `s01..s40` (студенты)
