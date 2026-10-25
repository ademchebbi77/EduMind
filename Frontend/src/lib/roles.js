export const ROLE_LABELS = {
  student: 'Student',
  teacher: 'Teacher',
  admin: 'Administrator',
}

export const ROLE_BADGE_VARIANTS = {
  student: 'sage',
  teacher: 'brand',
  admin: 'clay',
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || ''
}

export function canManageCourses(role) {
  return role === 'teacher' || role === 'admin'
}

export function canEditCourse(user, course) {
  if (!user || !course) return false
  if (user.role === 'admin') return true
  return user.role === 'teacher' && course.owner === user.id
}

export function isStaff(role) {
  return role === 'admin'
}
