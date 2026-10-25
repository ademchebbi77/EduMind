import { cx } from '../../lib/cx'

export function Card({ as: Tag = 'section', className, children, ...props }) {
  return (
    <Tag className={cx('surface p-5 sm:p-6', className)} {...props}>
      {children}
    </Tag>
  )
}
