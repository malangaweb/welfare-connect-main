import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet } from 'lucide-react';
import WalletFundingDialog from './WalletFundingDialog';

interface WalletCardProps {
  balance: number;
  onViewTransactions: () => void;
  memberId?: string;
  memberName?: string;
  onFundingSuccess?: () => void;
  showFundingOption?: boolean;
}

const WalletCard = ({ 
  balance, 
  onViewTransactions, 
  memberId, 
  memberName,
  onFundingSuccess,
  showFundingOption = false
}: WalletCardProps) => {
  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-medium">Wallet Balance</CardTitle>
        <Wallet className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${balance < 0 ? 'text-red-500' : 'text-green-500'}`}>
          KES {balance.toLocaleString()}
        </p>
        <div className="mt-4 space-y-2">
          <Button variant="outline" className="w-full" onClick={onViewTransactions}>
            View Transaction History
          </Button>
          
          {showFundingOption && memberId && memberName && onFundingSuccess && (
            <WalletFundingDialog 
              memberId={memberId}
              memberName={memberName}
              onFundingSuccess={onFundingSuccess}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default WalletCard;
