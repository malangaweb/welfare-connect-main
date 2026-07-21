import { Badge } from '@/components/ui/badge'
import { Member } from '@/lib/types'

interface MemberStatusBadgeProps {
  member: Member
}

export function MemberStatusBadge({ member }: MemberStatusBadgeProps) {
  // Handle explicit status values first
  if (member.status === 'deceased') {
    return (
      <Badge variant="destructive" className="text-xs">
        Deceased
      </Badge>
    )
  }

  if (member.status === 'inactive') {
    return (
      <Badge variant="secondary" className="text-xs bg-gray-500">
        Inactive
      </Badge>
    )
  }

  if (member.status === 'active') {
    return (
      <Badge variant="default" className="text-xs bg-green-600">
        Active
      </Badge>
    )
  }

  // Probation status badge with remaining days
  if (member.status === 'probation') {
    const probationEnd = member.probationEndDate
      ? new Date(member.probationEndDate)
      : (() => {
          const registrationDate = new Date(member.registrationDate)
          const fallback = new Date(registrationDate)
          fallback.setDate(fallback.getDate() + 90)
          return fallback
        })()

    const now = new Date()
    const daysRemaining = Math.ceil((probationEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    return (
      <Badge variant="secondary" className="text-xs bg-amber-500 text-white">
        Probation ({Math.max(0, daysRemaining)}d)
      </Badge>
    )
  }

  // Fallback
  return (
    <Badge variant="outline" className="text-xs">
      {member.status || 'Unknown'}
    </Badge>
  )
}
