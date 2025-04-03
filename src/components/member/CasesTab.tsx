
import { PlusCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const CasesTab = () => {
  const navigate = useNavigate();
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Associated Cases</CardTitle>
        <Button variant="outline" size="sm" onClick={() => navigate('/cases/new')}>
          <PlusCircle className="h-4 w-4 mr-2" />
          Create Case
        </Button>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <p className="text-muted-foreground">Loading associated cases...</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default CasesTab;
