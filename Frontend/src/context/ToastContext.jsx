import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

const ToastContext = createContext(null)

const TOAST_ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const TOAST_STYLES = {
  success: 'border-sage/25 border-l-sage text-sage',
  error: 'border-clay/25 border-l-clay text-clay',
  info: 'border-brand/25 border-l-brand text-brand-strong',
}

let nextToastId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const addToast = useCallback(
    ({ type = 'info', message, duration = 5000 }) => {
      const id = nextToastId++
      setToasts((current) => [...current, { id, type, message }])
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), duration),
      )
      return id
    },
    [dismiss],
  )

  useEffect(() => {
    const activeTimers = timers.current
    return () => {
      activeTimers.forEach((timer) => window.clearTimeout(timer))
      activeTimers.clear()
    }
  }, [])

  const value = useMemo(() => ({ addToast, dismiss }), [addToast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 top-4 z-[90] flex flex-col items-end gap-3 sm:inset-x-auto sm:right-6 sm:top-6"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => {
          const Icon = TOAST_ICONS[toast.type] || Info
          return (
            <div
              key={toast.id}
              role={toast.type === 'error' ? 'alert' : 'status'}
              className={`toast-enter pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-l-4 bg-white p-4 shadow-lg ${
                TOAST_STYLES[toast.type] || TOAST_STYLES.info
              }`}
            >
              <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-sm font-medium text-ink-soft">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded-md p-1 text-slate-400 transition hover:bg-mist hover:text-ink-soft"
                aria-label="Dismiss notification"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider.')
  }
  return context
}
