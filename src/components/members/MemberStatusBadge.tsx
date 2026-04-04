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

  // Calculate probation status
  if (member.status === 'probation' || !member.status || member.status === 'active') {
    const registrationDate = new Date(member.registrationDate)
    const probationEnd = new Date(registrationDate)
    probationEnd.setDate(probationEnd.getDate() + 90)

    const now = new Date()
    const daysRemaining = Math.ceil((probationEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysRemaining > 0) {
      return (
        <Badge variant="secondary" className="text-xs bg-amber-500 text-white">
          Probation ({daysRemaining}d)
        </Badge>
      )
    }

    return (
      <Badge variant="default" className="text-xs bg-green-600">
        Active
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
