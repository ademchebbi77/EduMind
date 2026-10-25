export function AcademicMotif({ className, bookmark = true }) {
  return (
    <svg viewBox="0 0 360 260" fill="none" aria-hidden="true" className={className}>
      <circle cx="281" cy="62" r="34" stroke="currentColor" strokeOpacity=".18" />
      <circle cx="281" cy="62" r="22" fill="currentColor" fillOpacity=".06" />
      <path
        d="M281 16v11M281 97v11M235 62h11M316 62h11M249 30l8 8M305 86l8 8M313 30l-8 8M257 86l-8 8"
        stroke="currentColor"
        strokeOpacity=".35"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M54 166c45-19 84-15 126 7 42-22 81-26 126-7v50c-45-19-84-15-126 7-42-22-81-26-126-7v-50Z"
        fill="currentColor"
        fillOpacity=".05"
      />
      <path
        d="M54 166c45-19 84-15 126 7v50c-42-22-81-26-126-7v-50Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M306 166c-45-19-84-15-126 7v50c42-22 81-26 126-7v-50Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M82 180c29-8 54-5 80 8M82 197c29-8 54-5 80 8M198 188c26-13 51-16 80-8M198 205c26-13 51-16 80-8"
        stroke="currentColor"
        strokeOpacity=".45"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M180 173v50" stroke="currentColor" strokeOpacity=".35" strokeWidth="2" />
      {bookmark ? (
        <path
          d="M258 111v52l-18-11-18 11v-52"
          fill="currentColor"
          className="text-brand"
          fillOpacity=".9"
        />
      ) : null}
      <path
        d="M28 104c14-6 29-3 42 8 13-11 28-14 42-8"
        stroke="currentColor"
        strokeOpacity=".16"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="78" cy="58" r="3" fill="currentColor" fillOpacity=".3" />
      <circle cx="121" cy="36" r="2" fill="currentColor" fillOpacity=".25" />
    </svg>
  )
}
