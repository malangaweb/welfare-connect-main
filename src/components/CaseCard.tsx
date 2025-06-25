import { format } from 'date-fns';
import { Calendar, User } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Case, CaseType } from '@/lib/types';

interface CaseCardProps {
  case: Case;
  onClick?: () => void;
}

const CaseCard = ({ case: caseItem, onClick }: CaseCardProps) => {
  const progress = (caseItem.actualAmount / caseItem.expectedAmount) * 100;
  
  const getCaseTypeColor = (type: CaseType) => {
    switch (type) {
      case CaseType.EDUCATION:
        return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
      case CaseType.SICKNESS:
        return 'bg-amber-100 text-amber-800 hover:bg-amber-100';
      case CaseType.DEATH:
        return 'bg-purple-100 text-purple-800 hover:bg-purple-100';
      default:
        return '';
    }
  };
  
  const getStatusColor = (isActive: boolean, isFinalized: boolean) => {
    if (isFinalized) return 'bg-green-100 text-green-800 hover:bg-green-100';
    if (isActive) return 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100';
    return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
  };
  
  const getStatusText = (isActive: boolean, isFinalized: boolean) => {
    if (isFinalized) return 'Finalized';
    if (isActive) return 'Active';
    return 'Draft';
  };

  return (
    <Card className={`overflow-hidden hover-lift ${onClick ? 'cursor-pointer' : ''}`}>
      <CardContent className="p-5">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-medium">Case #{caseItem.caseNumber}</h3>
              <Badge variant="outline" className={getCaseTypeColor(caseItem.caseType)}>
                {caseItem.caseType}
              </Badge>
              <Badge variant="outline" className={getStatusColor(caseItem.isActive, caseItem.isFinalized)}>
                {getStatusText(caseItem.isActive, caseItem.isFinalized)}
              </Badge>
            </div>
            
            <div className="mt-2 flex items-center text-sm text-muted-foreground">
              <User className="mr-1 h-4 w-4" />
              <span>{caseItem.affectedMember?.name || 'Unknown Member'}</span>
            </div>
            
            <div className="mt-1 flex items-center text-sm text-muted-foreground">
              <Calendar className="mr-1 h-4 w-4" />
              <span>
                {format(caseItem.startDate, 'MMM d')} - {format(caseItem.endDate, 'MMM d, yyyy')}
              </span>
            </div>
          </div>
          
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Contribution/Member</p>
            <p className="font-semibold">KES {caseItem.contributionPerMember.toLocaleString()}</p>
          </div>
        </div>
        
        <div className="mt-5">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm">Collection Progress</span>
            <span className="text-sm font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-muted-foreground">
              KES {caseItem.actualAmount.toLocaleString()}
            </span>
            <span className="text-muted-foreground">
              KES {caseItem.expectedAmount.toLocaleString()}
            </span>
          </div>
        </div>
      </CardContent>
      
      {onClick && (
        <CardFooter className="px-5 py-3 border-t bg-secondary/30">
          <Button variant="ghost" size="sm" className="w-full" onClick={onClick}>
            View Details
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};

export default CaseCard;
