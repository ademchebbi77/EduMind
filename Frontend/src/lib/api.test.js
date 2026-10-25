import { describe, expect, it } from 'vitest'
import { firstFieldError, getCookie, normalizeApiError } from './api'

describe('normalizeApiError', () => {
  it('keeps the backend error envelope, fields and status', () => {
    const error = {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: {
            code: 'validation_error',
            message: 'The submitted data is invalid.',
            fields: { email: ['This address is already in use.'] },
          },
        },
      },
    }

    expect(normalizeApiError(error)).toEqual({
      code: 'validation_error',
      message: 'The submitted data is invalid.',
      fields: { email: ['This address is already in use.'] },
      status: 400,
    })
  })

  it('reports a network error when no response is available', () => {
    const result = normalizeApiError({ isAxiosError: true })

    expect(result.code).toBe('network_error')
    expect(result.status).toBe(0)
    expect(result.message).toMatch(/connection/iu)
  })

  it('falls back for non-Axios errors', () => {
    const result = normalizeApiError(new Error('boom'), 'Unable.')

    expect(result).toMatchObject({
      code: 'unexpected_error',
      message: 'boom',
      status: null,
    })
  })
})

describe('firstFieldError', () => {
  it('returns the first message of a field', () => {
    expect(firstFieldError({ email: ['First', 'Second'] }, 'email')).toBe('First')
    expect(firstFieldError({ email: 'Simple' }, 'email')).toBe('Simple')
    expect(firstFieldError({}, 'email')).toBeNull()
  })
})

describe('getCookie', () => {
  it('reads a cookie value', () => {
    document.cookie = 'csrftoken=token-de-test'
    expect(getCookie('csrftoken')).toBe('token-de-test')
    expect(getCookie('absent')).toBeNull()
  })
})
