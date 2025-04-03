
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface AccountSummaryCardProps {
  title: string;
  balance: number;
  credits: number;
  debits: number;
}

const AccountSummaryCard = ({ title, balance, credits, debits }: AccountSummaryCardProps) => {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Current Balance</p>
            <p className="text-2xl font-bold">KES {balance.toLocaleString()}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Credits</p>
            <p className="text-xl font-medium text-green-600">KES {credits.toLocaleString()}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Debits</p>
            <p className="text-xl font-medium text-red-600">KES {debits.toLocaleString()}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountSummaryCard;
