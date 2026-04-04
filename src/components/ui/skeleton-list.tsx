import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

interface SkeletonListProps {
  /** Number of skeleton items to display */
  count?: number;
  /** Additional class names */
  className?: string;
  /** Show list item skeleton (for member/case cards) */
  variant?: 'card' | 'row';
}

/**
 * Skeleton loader for list loading states.
 * Displays a series of pulsing skeleton placeholders
 * while data is being fetched.
 */
export function SkeletonList({ 
  count = 5, 
  className = '',
  variant = 'card' 
}: SkeletonListProps) {
  if (variant === 'row') {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: count }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

/**
 * Skeleton card that mimics the MemberCard layout
 */
function SkeletonCard() {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex space-x-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
              
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          </div>
          
          <Skeleton className="h-5 w-5" />
        </div>
        
        <div className="mt-4 flex justify-between">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-28" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton card that mimics the CaseCard layout
 */
export function SkeletonCaseCard() {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-14" />
            </div>
            
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>
          
          <div className="text-right space-y-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
        
        <div className="mt-5 space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-2 w-full" />
          <div className="flex justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton list specifically for case cards
 */
export function SkeletonCaseList({ count = 5, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCaseCard key={index} />
      ))}
    </div>
  );
}

export default SkeletonList;
