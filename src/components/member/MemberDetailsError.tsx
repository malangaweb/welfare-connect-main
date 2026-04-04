
import { Button } from '@/components/ui/button';

interface MemberDetailsErrorProps {
  error: string | null;
  onBack: () => void;
}

const MemberDetailsError = ({ error, onBack }: MemberDetailsErrorProps) => {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)]">
      <h2 className="text-xl font-semibold mb-2">Member not found</h2>
      <p className="text-muted-foreground mb-4">{error || "The requested member could not be found."}</p>
      <Button onClick={onBack}>
        Go back to members
      </Button>
    </div>
  );
};

export default MemberDetailsError;
