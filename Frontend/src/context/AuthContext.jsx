import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  changePasswordRequest,
  fetchCurrentUser,
  loginRequest,
  logoutRequest,
  registerRequest,
  updateProfileRequest,
} from '../api/auth'
import { normalizeApiError } from '../lib/api'

const AuthContext = createContext(null)

const STORAGE_KEY = 'edumind_user'

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveUser(user) {
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadStoredUser)
  const [status, setStatus] = useState(() => loadStoredUser() ? 'authenticated' : 'loading')

  useEffect(() => {
    let active = true

    fetchCurrentUser()
      .then((data) => {
        if (!active) return
        setUser(data)
        saveUser(data)
        setStatus('authenticated')
      })
      .catch(() => {
        if (!active) return
        // If we have a stored user but session expired, keep them logged in
        // and clear storage only if no stored user exists
        const stored = loadStoredUser()
        if (!stored) {
          setUser(null)
          setStatus('guest')
        } else {
          setStatus('authenticated')
        }
      })

    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (email, password) => {
    try {
      const data = await loginRequest({ email, password })
      setUser(data)
      saveUser(data)
      setStatus('authenticated')
      return data
    } catch (error) {
      throw normalizeApiError(error, 'Unable to sign in.')
    }
  }, [])

  const register = useCallback(async (payload) => {
    try {
      const data = await registerRequest(payload)
      setUser(data)
      saveUser(data)
      setStatus('authenticated')
      return data
    } catch (error) {
      throw normalizeApiError(error, 'Unable to create your account.')
    }
  }, [])

  const updateProfile = useCallback(async (payload) => {
    try {
      const data = await updateProfileRequest(payload)
      setUser(data)
      saveUser(data)
      return data
    } catch (error) {
      throw normalizeApiError(error, 'Profile update failed.')
    }
  }, [])

  const changePassword = useCallback(async (payload) => {
    try {
      return await changePasswordRequest(payload)
    } catch (error) {
      throw normalizeApiError(error, 'Password change failed.')
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } catch (error) {
      const normalized = normalizeApiError(error, 'Unable to sign out.')
      if (normalized.status !== 401) {
        throw normalized
      }
    } finally {
      setUser(null)
      saveUser(null)
      setStatus('guest')
    }
  }, [])

  const value = useMemo(
    () => ({ user, status, login, register, updateProfile, changePassword, logout }),
    [user, status, login, register, updateProfile, changePassword, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.')
  }
  return context
}
