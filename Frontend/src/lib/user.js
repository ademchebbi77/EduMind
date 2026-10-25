export function initialsOf(user) {
  if (!user) return '?'
  const initials = [user.first_name, user.last_name]
    .filter(Boolean)
    .map((value) => value.trim().charAt(0))
    .join('')
  return (initials || user.email || '?').slice(0, 2).toUpperCase()
}
