/**
 * Decode the payload portion of a JWT token and return the claims object.
 * Does NOT verify the signature — client-side parsing only for display data.
 */
export function parseJwt<T = Record<string, unknown>>(token: string): T | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    // URL-safe base64 → standard base64
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(base64)
    return JSON.parse(decoded) as T
  } catch {
    return null
  }
}

/**
 * Extract user avatar URL from the JWT token stored in localStorage.
 */
export function getUserAvatarUrl(): string | null {
  const token = localStorage.getItem('token')
  if (!token) return null
  const payload = parseJwt<Record<string, unknown>>(token)
  if (!payload) return null
  const url = payload['image_url']
  return typeof url === 'string' && url.length > 0 ? url : null
}

/**
 * Extract username / email from the JWT token.
 */
export function getUserDisplayName(): string {
  const token = localStorage.getItem('token')
  if (!token) return '用户'
  const payload = parseJwt<Record<string, unknown>>(token)
  if (!payload) return '用户'
  const name = payload['user_name'] || payload['username'] || payload['email'] || payload['sub']
  return typeof name === 'string' ? name : '用户'
}

/**
 * Extract user ID from the JWT token.
 * Backend stores it in the `user_id` claim (see JwtUtil.createJWT).
 */
export function getUserId(): string | null {
  const token = localStorage.getItem('token')
  if (!token) return null
  const payload = parseJwt<Record<string, unknown>>(token)
  if (!payload) return null
  const id = payload['user_id']
  return id != null ? String(id) : null
}

/**
 * Extract user_name claim from JWT (used for WebSocket path, etc.).
 */
export function getUserName(): string | null {
  const token = localStorage.getItem('token')
  if (!token) return null
  const payload = parseJwt<Record<string, unknown>>(token)
  if (!payload) return null
  const name = payload['user_name']
  return typeof name === 'string' ? name : null
}
