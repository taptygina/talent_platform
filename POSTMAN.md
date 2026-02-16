# Postman Quick Start

Base URL:
- `http://127.0.0.1:8000/api`

## 1) Login
`POST /auth/login/`

Body:
```json
{
  "username": "curator1",
  "password": "12345678Aa!"
}
```

Response now includes:
- `access`
- `refresh`
- `token_type`

You can use either:
- Cookie auth (Postman cookies), or
- Header auth: `Authorization: Bearer <access>`

## 2) Refresh token
`POST /auth/refresh/`

Option A (cookie):
- send request without body

Option B (body):
```json
{
  "refresh": "<refresh_token>"
}
```

## 3) Import users from Excel
`POST /auth/import-users/`

Form-data:
- `role`: `student|teacher|methodist|curator`
- `file`: `.xlsx`

Required columns in xlsx:
- `first_name`
- `last_name`

Optional:
- `middle_name`, `email`, `phone`, `group_name`

## 4) Download import template
`GET /auth/import-users/template/`

## 4.1) Generate credentials PDF
`POST /auth/import-users/credentials-pdf/`

Body example:
```json
{
  "role": "student",
  "accounts": [
    { "id": 10, "username": "ivanov.ivan", "password": "Abc123XYZ9" },
    { "id": 11, "username": "petrova.anna", "password": "Qwe456RTY0" }
  ]
}
```

## 5) Project creation modes
`POST /projects/`

Only one mode per request:

1) By academic group:
```json
{
  "title": "Coursework project",
  "type": "coursework",
  "status": "planned",
  "supervisor_id": 2,
  "group_name": "ИС-222б"
}
```

2) By existing team:
```json
{
  "title": "Creative sprint",
  "type": "contest",
  "status": "planned",
  "supervisor_id": 2,
  "team_id": 1
}
```

3) Create new team on the fly:
```json
{
  "title": "Hackathon team",
  "type": "contest",
  "status": "planned",
  "supervisor_id": 2,
  "new_team_name": "Vision Team",
  "new_team_member_ids": [3, 4, 5]
}
```

## 6) Useful lookup endpoints
- `GET /projects/groups/`
- `GET /projects/teams/`
- `GET /auth/me/`
