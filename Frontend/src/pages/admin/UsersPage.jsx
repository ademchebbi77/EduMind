import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Pencil,
  RotateCcw,
  SearchX,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react'
import { deleteUser, fetchUsers, updateUser } from '../../api/users'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { ROLE_BADGE_VARIANTS, ROLE_LABELS, roleLabel } from '../../lib/roles'
import { initialsOf } from '../../lib/user'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { UserDeleteModal } from '../../components/admin/UserDeleteModal'
import { UserStatusModal } from '../../components/admin/UserStatusModal'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select } from '../../components/ui/Field'
import { Skeleton } from '../../components/ui/Skeleton'
import { Pagination } from '../../components/courses/Pagination'

const EMPTY_RESULTS = { count: 0, next: null, previous: null, results: [] }

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'true', label: 'Active accounts' },
  { value: 'false', label: 'Deactivated accounts' },
]

function UsersTableSkeleton() {
  return (
    <Card className="space-y-4" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-9 w-24" />
        </div>
      ))}
    </Card>
  )
}

export default function UsersPage() {
  useDocumentTitle('Account management')

  const { user } = useAuth()
  const { addToast } = useToast()

  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(search)

  const [reload, setReload] = useState(0)
  const [result, setResult] = useState({ key: null, data: EMPTY_RESULTS, error: null })

  const [statusTarget, setStatusTarget] = useState(null)
  const [changingStatus, setChangingStatus] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const query = useMemo(
    () => ({
      search: debouncedSearch.trim(),
      role,
      isActive: status,
      page,
    }),
    [debouncedSearch, role, status, page],
  )
  const requestKey = `${JSON.stringify(query)}:${reload}`

  useEffect(() => {
    const controller = new AbortController()

    fetchUsers(query, { signal: controller.signal })
      .then((payload) => setResult({ key: requestKey, data: payload, error: null }))
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setResult({
          key: requestKey,
          data: EMPTY_RESULTS,
          error: normalizeApiError(
            requestError,
            'Unable to load accounts.',
          ),
        })
      })

    return () => controller.abort()
  }, [query, requestKey])

  const loading = result.key !== requestKey
  const data = result.data
  const error = loading ? null : result.error
  const hasFilters = Boolean(search.trim() || role || status)
  const showInitialSkeleton = loading && data.results.length === 0
  const showEmpty = !loading && !error && data.results.length === 0

  function resetFilters() {
    setSearch('')
    setRole('')
    setStatus('')
    setPage(1)
  }

  function changePage(nextPage) {
    setPage(Math.max(1, nextPage))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function confirmStatusChange() {
    if (!statusTarget) return
    const target = statusTarget
    const nextActive = !target.is_active

    setChangingStatus(true)
    try {
      const updated = await updateUser(target.id, { is_active: nextActive })
      setResult((current) => ({
        ...current,
        data: {
          ...current.data,
          results: current.data.results.map((account) =>
            account.id === updated.id ? { ...account, ...updated } : account,
          ),
        },
      }))
      addToast({
        type: 'success',
        message: nextActive
          ? `${target.full_name}'s account has been reactivated.`
          : `${target.full_name}'s account has been deactivated.`,
      })
      setStatusTarget(null)
    } catch (statusError) {
      const normalized = normalizeApiError(
        statusError,
        'Status update failed.',
      )
      addToast({
        type: 'error',
        message:
          firstFieldError(normalized.fields, 'is_active') ||
          firstFieldError(normalized.fields, 'role') ||
          firstFieldError(normalized.fields, 'non_field_errors') ||
          normalized.message,
      })
    } finally {
      setChangingStatus(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget

    setDeleting(true)
    try {
      await deleteUser(target.id)
      addToast({
        type: 'success',
        message: `${target.full_name}'s account has been deleted.`,
      })
      setDeleteTarget(null)
      if (data.results.length === 1 && page > 1) {
        setPage(page - 1)
      } else {
        setReload((current) => current + 1)
      }
    } catch (deleteError) {
      const normalized = normalizeApiError(
        deleteError,
        'Account deletion failed.',
      )
      addToast({
        type: 'error',
        message:
          firstFieldError(normalized.fields, 'non_field_errors') ||
          normalized.message,
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
            <span className="h-px w-7 bg-brand" aria-hidden="true" />
            Administration
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Account management
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Browse users, adjust their role and manage their access to the platform.
          </p>
        </div>

        {!loading && !error ? (
          <Badge variant="brand" className="self-start sm:self-auto">
            {data.count} {data.count > 1 ? 'accounts' : 'account'}
          </Badge>
        ) : null}
      </header>

      <Card className="bg-paper/90">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr]">
          <Input
            label="Search"
            type="search"
            name="search"
            placeholder="Name or email address…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />

          <Select
            label="Role"
            name="role"
            value={role}
            onChange={(event) => {
              setRole(event.target.value)
              setPage(1)
            }}
          >
            <option value="">All roles</option>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          <Select
            label="Status"
            name="status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        {hasFilters ? (
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Reset filters
            </Button>
          </div>
        ) : null}
      </Card>

      {error ? (
        <div role="alert">
          <EmptyState
            icon={AlertTriangle}
            title="Unable to load accounts"
            description={error.message}
            action={
              <Button
                variant="secondary"
                onClick={() => setReload((current) => current + 1)}
              >
                Try again
              </Button>
            }
          />
        </div>
      ) : null}

      {showInitialSkeleton ? <UsersTableSkeleton /> : null}

      {showEmpty && hasFilters ? (
        <EmptyState
          icon={SearchX}
          title="No accounts match"
          description="Try another keyword, another role, or reset the filters."
          action={
            <Button variant="secondary" onClick={resetFilters}>
              Reset filters
            </Button>
          }
        />
      ) : null}

      {showEmpty && !hasFilters ? (
        <EmptyState
          icon={Users}
          title="No accounts to display"
          description="New users will appear here as soon as they sign up."
        />
      ) : null}

      {data.results.length > 0 ? (
        <Card className={`overflow-hidden p-0 sm:p-0 ${loading ? 'opacity-60' : ''}`}>
          <div
            aria-hidden="true"
            className="hidden border-b border-line bg-mist/70 px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 xl:grid xl:grid-cols-[minmax(0,2fr)_7rem_7.5rem_8rem_8.5rem] xl:items-center xl:gap-4"
          >
            <span>Account</span>
            <span>Role</span>
            <span>Status</span>
            <span>Joined</span>
            <span className="text-right">Actions</span>
          </div>

          <ul
            aria-label="List of EduMind platform accounts"
            aria-busy={loading}
            className="divide-y divide-line"
          >
            {data.results.map((account) => {
              const isSelf = account.id === user?.id
              return (
                <li key={account.id} className="hover:bg-mist/40">
                  <div className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(0,2fr)_7rem_7.5rem_8rem_8.5rem] xl:items-center">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 font-display text-sm font-semibold text-brand-strong ring-1 ring-brand/15"
                        aria-hidden="true"
                      >
                        {initialsOf(account)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold text-ink">
                            {account.full_name}
                          </p>
                          {isSelf ? (
                            <Badge variant="brand">Your account</Badge>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-slate-500">
                          {account.email}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-t border-line pt-3 sm:grid-cols-3 xl:contents xl:border-0 xl:pt-0">
                      <div>
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 xl:hidden">
                          Role
                        </span>
                        <Badge
                          variant={ROLE_BADGE_VARIANTS[account.role] || 'neutral'}
                          className="mt-1 xl:mt-0"
                        >
                          {roleLabel(account.role)}
                        </Badge>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 xl:hidden">
                          Status
                        </span>
                        <Badge
                          variant={account.is_active ? 'success' : 'warning'}
                          dot
                          className="mt-1 xl:mt-0"
                        >
                          {account.is_active ? 'Active' : 'Deactivated'}
                        </Badge>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 xl:hidden">
                          Joined
                        </span>
                        <p className="mt-1 whitespace-nowrap text-sm text-slate-600 xl:mt-0">
                          {formatDate(account.date_joined)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 xl:justify-end xl:border-0 xl:pt-0">
                      <LinkButton
                        to={isSelf ? '/profile' : `/users/${account.id}/edit`}
                        variant="secondary"
                        size="sm"
                        title="Edit"
                        aria-label={
                          isSelf
                            ? 'Edit my profile'
                            : `Edit ${account.full_name}'s account`
                        }
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                      </LinkButton>

                      {!isSelf ? (
                        <button
                          type="button"
                          onClick={() => setStatusTarget(account)}
                          className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
                            account.is_active
                              ? 'text-clay hover:bg-clay/[0.07] focus-visible:outline-clay'
                              : 'text-sage hover:bg-sage/[0.07] focus-visible:outline-sage'
                          }`}
                          title={account.is_active ? 'Deactivate' : 'Reactivate'}
                          aria-label={
                            account.is_active
                              ? `Deactivate ${account.full_name}'s account`
                              : `Reactivate ${account.full_name}'s account`
                          }
                        >
                          {account.is_active ? (
                            <UserX className="size-3.5" aria-hidden="true" />
                          ) : (
                            <UserCheck className="size-3.5" aria-hidden="true" />
                          )}
                        </button>
                      ) : null}

                      {!isSelf ? (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(account)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-600 transition hover:bg-clay/[0.07] hover:text-clay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
                          title="Delete"
                          aria-label={`Delete ${account.full_name}'s account`}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      {data.results.length > 0 && (data.next || data.previous) ? (
        <Pagination
          count={data.count}
          page={page}
          hasNext={Boolean(data.next)}
          hasPrevious={Boolean(data.previous)}
          disabled={loading}
          onPageChange={changePage}
          singular="account"
          plural="accounts"
          ariaLabel="Account pagination"
        />
      ) : null}

      {data.count > 0 && !data.next && !data.previous ? (
        <p className="text-center text-xs text-slate-600">
          {data.count} {data.count > 1 ? 'accounts' : 'account'} in total ·{' '}
          <button
            type="button"
            onClick={() => setReload((current) => current + 1)}
            className="font-medium text-brand-strong underline decoration-brand/40 underline-offset-4 hover:decoration-brand"
          >
            refresh
          </button>
        </p>
      ) : null}

      <UserStatusModal
        account={statusTarget}
        open={Boolean(statusTarget)}
        changing={changingStatus}
        onClose={() => {
          if (!changingStatus) setStatusTarget(null)
        }}
        onConfirm={confirmStatusChange}
      />

      <UserDeleteModal
        account={deleteTarget}
        open={Boolean(deleteTarget)}
        deleting={deleting}
        onClose={() => {
          if (!deleting) setDeleteTarget(null)
        }}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
