import { useAuth } from '../features/auth/AuthContext'
import { formatRole } from '../utils/labels'

export function ProfilePage() {
  const { user } = useAuth()

  return (
    <main className="page">
      <section className="panel profile-layout">
        <div className="profile-main">
          <h1>Профиль пользователя</h1>
          <p className="muted-text">Личные данные, роль и рабочие настройки.</p>

          <div className="info-grid">
            <article className="panel soft-panel">
              <h2>Основная информация</h2>
              <p>
                ФИО: <strong>{user?.full_name || '-'}</strong>
              </p>
              <p>
                Логин: <strong>{user?.username || '-'}</strong>
              </p>
              <p>
                Email: <strong>{user?.email || '-'}</strong>
              </p>
            </article>

            <article className="panel soft-panel">
              <h2>Роль в системе</h2>
              <p>
                Текущая роль: <strong>{formatRole(user?.role)}</strong>
              </p>
              <p className="muted-text">
                Права доступа определяются ролью и правилами безопасности платформы.
              </p>
            </article>
          </div>
        </div>

        <aside className="profile-side panel soft-panel">
          <h2>Настройки</h2>
          <p>Страница подготовлена как основа для персональных настроек.</p>
          <ul className="list compact-list">
            <li className="list-item">Уведомления</li>
            <li className="list-item">Безопасность</li>
            <li className="list-item">Предпочтения отображения</li>
          </ul>
        </aside>
      </section>
    </main>
  )
}
