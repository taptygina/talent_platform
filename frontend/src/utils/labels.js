const roleLabels = {
  student: 'Студент',
  teacher: 'Преподаватель',
  methodist: 'Методист',
  curator: 'Куратор',
  admin: 'Администратор',
}

const projectTypeLabels = {
  contest: 'Конкурс',
  olympiad: 'Олимпиада',
  coursework: 'Курсовой проект',
  diploma: 'Дипломный проект',
  other: 'Другое',
}

const projectStatusLabels = {
  planned: 'Запланирован',
  in_progress: 'В работе',
  review: 'На проверке',
  done: 'Завершен',
  cancelled: 'Отменен',
}

const stageStatusLabels = {
  open: 'Открыт',
  submitted: 'Сдан на проверку',
  changes_requested: 'Нужны доработки',
  approved: 'Принят',
}

const notificationTypeLabels = {
  project_created: 'Создан проект',
  stage_created: 'Создан этап',
  stage_updated: 'Обновлен этап',
  stage_deleted: 'Удален этап',
  stage_deadline: 'Срок этапа',
  stage_status_changed: 'Изменение статуса этапа',
  team_invited: 'Приглашение в команду',
  supervisor_invited: 'Приглашение руководителю',
  supervisor_invite_accepted: 'Приглашение принято',
  supervisor_invite_declined: 'Приглашение отклонено',
}

function fallback(value) {
  if (!value) return '-'
  return String(value)
}

export function formatRole(value) {
  return roleLabels[value] || fallback(value)
}

export function formatProjectType(value) {
  return projectTypeLabels[value] || fallback(value)
}

export function formatProjectStatus(value) {
  return projectStatusLabels[value] || fallback(value)
}

export function formatStageStatus(value) {
  return stageStatusLabels[value] || fallback(value)
}

export function formatNotificationType(value) {
  return notificationTypeLabels[value] || fallback(value)
}
