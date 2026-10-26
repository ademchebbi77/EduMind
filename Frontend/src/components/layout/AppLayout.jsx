import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  Gamepad2,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  LogOut,
  Megaphone,
  Menu,
  Mic,
  Pencil,
  Plus,
  ShieldAlert,
  Sparkles,
  Users,
  Video,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AccessibilityButton } from '../accessibility/AccessibilityButton'
import { useToast } from '../../context/ToastContext'
import { canManageCourses, isStaff, roleLabel } from '../../lib/roles'
import { cx } from '../../lib/cx'
import { initialsOf } from '../../lib/user'
import { Badge } from '../ui/Badge'
import { Logo } from '../ui/Logo'

function navLinkClasses({ isActive }) {
  return cx(
    'flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm font-medium transition',
    isActive
      ? 'border-brand bg-white/[0.08] text-paper shadow-sm shadow-black/10'
      : 'border-transparent text-white/60 hover:bg-white/[0.04] hover:text-paper',
  )
}

function SidebarContent({ user, onNavigate, onClose, closeButtonRef }) {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [loggingOut, setLoggingOut] = useState(false)
  const { logout } = useAuth()

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (error) {
      addToast({
        type: 'error',
        message: error.message || 'Sign out failed. Please try again.',
      })
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-ink text-white">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-brand" />

      <div className="relative flex items-center justify-between px-5 pb-5 pt-7">
        <Logo light showTagline to="/dashboard" />
        {onClose ? (
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-paper"
            aria-label="Close menu"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="relative mx-5 h-px bg-white/10" />

      <nav
        aria-label="Main navigation"
        className="sidebar-scroll relative flex-1 space-y-1 overflow-y-auto px-3 py-6"
      >
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
          Learning space
        </p>
        <NavLink to="/dashboard" onClick={onNavigate} className={navLinkClasses}>
          <LayoutDashboard className="size-5" aria-hidden="true" />
          Dashboard
        </NavLink>
        <NavLink to="/courses" end onClick={onNavigate} className={navLinkClasses}>
          <BookOpen className="size-5" aria-hidden="true" />
          Courses
        </NavLink>
        {user?.role === 'student' && (
          <NavLink to="/my-courses" onClick={onNavigate} className={navLinkClasses}>
            <GraduationCap className="size-5" aria-hidden="true" />
            My courses
          </NavLink>
        )}
        <NavLink to="/assessments" onClick={onNavigate} className={navLinkClasses}>
          <ClipboardCheck className="size-5" aria-hidden="true" />
          Quizzes &amp; exercises
        </NavLink>
        <NavLink to="/voice-questions" onClick={onNavigate} className={navLinkClasses}>
          <Mic className="size-5" aria-hidden="true" />
          Voice questions
        </NavLink>
        {user?.role === 'student' && (
          <NavLink to="/live" end onClick={onNavigate} className={navLinkClasses}>
            <Gamepad2 className="size-5" aria-hidden="true" />
            Live quiz
          </NavLink>
        )}
        <NavLink to="/sessions" onClick={onNavigate} className={navLinkClasses}>
          <Video className="size-5" aria-hidden="true" />
          Sessions en ligne
        </NavLink>
        <NavLink to="/calendar" onClick={onNavigate} className={navLinkClasses}>
          <Calendar className="size-5" aria-hidden="true" />
          Calendrier
        </NavLink>
        <NavLink to="/announcements" onClick={onNavigate} className={navLinkClasses}>
          <Megaphone className="size-5" aria-hidden="true" />
          Annonces
        </NavLink>
        {user?.role === 'student' && (
          <NavLink to="/my-enrollments" onClick={onNavigate} className={navLinkClasses}>
            <ClipboardList className="size-5" aria-hidden="true" />
            Mes inscriptions
          </NavLink>
        )}

        {canManageCourses(user?.role) ? (
          <>
            <p className="px-3 pb-2 pt-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
              Teaching
            </p>
            <NavLink to="/courses/new" onClick={onNavigate} className={navLinkClasses}>
              <Plus className="size-5" aria-hidden="true" />
              Add a course
            </NavLink>
            <NavLink to="/course-enrollments" onClick={onNavigate} className={navLinkClasses}>
              <ClipboardList className="size-5" aria-hidden="true" />
              Course enrollments
            </NavLink>
            <NavLink to="/quizzes/new" onClick={onNavigate} className={navLinkClasses}>
              <Plus className="size-5" aria-hidden="true" />
              Add a quiz
            </NavLink>
            <NavLink to="/quizzes/generate" onClick={onNavigate} className={navLinkClasses}>
              <Sparkles className="size-5" aria-hidden="true" />
              Generate a quiz
            </NavLink>
            <NavLink to="/exercises/new" onClick={onNavigate} className={navLinkClasses}>
              <Plus className="size-5" aria-hidden="true" />
              Add an exercise
            </NavLink>
            <NavLink to="/sessions/new" onClick={onNavigate} className={navLinkClasses}>
              <Video className="size-5" aria-hidden="true" />
              Nouvelle session
            </NavLink>
            <NavLink to="/announcements/new" onClick={onNavigate} className={navLinkClasses}>
              <Megaphone className="size-5" aria-hidden="true" />
              Nouvelle annonce
            </NavLink>
            <NavLink to="/at-risk" onClick={onNavigate} className={navLinkClasses}>
              <ShieldAlert className="size-5" aria-hidden="true" />
              Étudiants à risque
            </NavLink>
          </>
        ) : null}

        {isStaff(user?.role) ? (
          <>
            <p className="px-3 pb-2 pt-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
              Administration
            </p>
            <NavLink to="/users" onClick={onNavigate} className={navLinkClasses}>
              <Users className="size-5" aria-hidden="true" />
              Users
            </NavLink>
            <NavLink to="/enrollments" onClick={onNavigate} className={navLinkClasses}>
              <ClipboardList className="size-5" aria-hidden="true" />
              Inscriptions
            </NavLink>
          </>
        ) : null}
      </nav>

      <div className="relative mx-3 mb-2">
        <AccessibilityButton variant="sidebar" />
      </div>

      <div className="relative mx-3 mb-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center gap-3">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              className="size-10 shrink-0 rounded-full object-cover ring-1 ring-gold/25"
            />
          ) : (
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-sm font-semibold text-gold ring-1 ring-gold/25"
              aria-hidden="true"
            >
              {initialsOf(user)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-paper">
              {user?.full_name || user?.email}
            </p>
            <p className="truncate text-xs text-white/55">{user?.email}</p>
          </div>
        </div>
        <div className="mt-3">
          <Badge variant="onDark">{roleLabel(user?.role)}</Badge>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Link
            to="/profile"
            aria-label="Edit my profile"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2 py-1.5 text-xs font-semibold text-white/60 transition hover:border-gold/30 hover:bg-white/10 hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            aria-busy={loggingOut || undefined}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2 py-1.5 text-xs font-semibold text-white/60 transition hover:border-gold/30 hover:bg-white/10 hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-60"
          >
            {loggingOut ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="size-3.5" aria-hidden="true" />
            )}
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

function MobileSidebar({ open, onClose, user }) {
  const containerRef = useRef(null)
  const closeButtonRef = useRef(null)
  const location = useLocation()

  useEffect(() => {
    if (!open) return undefined

    const previouslyFocused = document.activeElement
    closeButtonRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (event.key !== 'Tab' || !containerRef.current) return

      const items = Array.from(
        containerRef.current.querySelectorAll(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null)

      if (!items.length) return

      const first = items[0]
      const last = items[items.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  useEffect(() => {
    if (open) onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/60 backdrop-blur-sm"
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="relative h-full w-[min(20rem,85vw)] shadow-2xl"
      >
        <SidebarContent
          user={user}
          onNavigate={onClose}
          onClose={onClose}
          closeButtonRef={closeButtonRef}
        />
      </div>
    </div>
  )
}

export function AppLayout() {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-mist">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 lg:block">
        <SidebarContent user={user} />
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
          <Logo to="/dashboard" />
          <div className="flex items-center gap-2">
            <AccessibilityButton />
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              aria-label="Open menu"
              className="rounded-xl border border-line bg-paper p-2.5 text-ink-soft transition hover:border-slate-300 hover:bg-mist"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div id="mobile-navigation">
          <MobileSidebar
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            user={user}
          />
        </div>

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl px-4 py-8 focus:outline-none sm:px-6 lg:px-10 lg:py-10"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
