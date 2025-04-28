import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from '@/components/ui/skeleton';

interface AccountSummaryCardProps {
  title: string;
  balance: number;
  credits: number;
  debits: number;
  isLoading?: boolean;
}

const AccountSummaryCard = ({ title, balance, credits, debits, isLoading = false }: AccountSummaryCardProps) => {
  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Current Balance</p>
            {isLoading ? (
              <Skeleton className="h-8 w-28 mt-1" />
            ) : (
              <p className="text-2xl font-bold">KES {balance.toLocaleString()}</p>
            )}
          </div>
          <div className="flex justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Credits</p>
              {isLoading ? (
                <Skeleton className="h-6 w-20 mt-1" />
              ) : (
                <p className="text-lg font-semibold text-green-600">KES {credits.toLocaleString()}</p>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Debits</p>
              {isLoading ? (
                <Skeleton className="h-6 w-20 mt-1" />
              ) : (
                <p className="text-lg font-semibold text-red-600">KES {debits.toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountSummaryCard;
