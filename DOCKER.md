# Запуск проекта в Docker

## Что поднимается
- `db` — PostgreSQL 16
- `backend` — Django API (`http://localhost:8000`)
- `frontend` — React + Nginx (`http://localhost`)

## Быстрый старт
1. Откройте терминал в корне проекта:
   - `d:\4 курс\курсовая\TalentPlatform`
2. Соберите и запустите контейнеры:
   - `docker compose up --build`
3. Откройте в браузере:
   - фронтенд: `http://localhost`
   - swagger: `http://localhost/api/docs/`

## Остановка
- `docker compose down`

## Полная очистка с удалением БД
- `docker compose down -v`

## Важно
- Данные PostgreSQL хранятся в томе `postgres_data`.
- Загруженные файлы Django (`media`) сохраняются в `backend/media`.
