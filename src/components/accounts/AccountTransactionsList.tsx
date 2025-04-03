
import { useState } from "react";
import { Search, Download, Filter } from "lucide-react";
import { 
  Table, 
  TableHeader, 
  TableRow, 
  TableHead, 
  TableBody, 
  TableCell 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Transaction } from "@/lib/types";

interface AccountTransactionsListProps {
  transactions: Transaction[];
  title: string;
}

const AccountTransactionsList = ({ transactions, title }: AccountTransactionsListProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');

  const years = Array.from(new Set(
    transactions.map(tx => new Date(tx.createdAt).getFullYear())
  )).sort((a, b) => b - a);

  const months = [
    { value: '0', label: 'January' },
    { value: '1', label: 'February' },
    { value: '2', label: 'March' },
    { value: '3', label: 'April' },
    { value: '4', label: 'May' },
    { value: '5', label: 'June' },
    { value: '6', label: 'July' },
    { value: '7', label: 'August' },
    { value: '8', label: 'September' },
    { value: '9', label: 'October' },
    { value: '10', label: 'November' },
    { value: '11', label: 'December' },
  ];

  const filteredTransactions = transactions.filter(tx => {
    // Search filter
    const matchesSearch = 
      tx.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.mpesaReference?.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Year filter
    const txYear = new Date(tx.createdAt).getFullYear().toString();
    const matchesYear = yearFilter === 'all' || txYear === yearFilter;
    
    // Month filter
    const txMonth = new Date(tx.createdAt).getMonth().toString();
    const matchesMonth = monthFilter === 'all' || txMonth === monthFilter;
    
    return matchesSearch && matchesYear && matchesMonth;
  });

  const handleExport = () => {
    // Implement CSV export functionality
    console.log('Exporting data...');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{title} Transactions</h3>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Filter by Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map(year => (
              <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Filter by Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {months.map(month => (
              <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTransactions.length > 0 ? (
              filteredTransactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>
                    {new Date(transaction.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{transaction.description}</TableCell>
                  <TableCell>Member #{transaction.memberId.substring(0, 8)}</TableCell>
                  <TableCell>{transaction.mpesaReference || "-"}</TableCell>
                  <TableCell className="text-right">
                    KES {transaction.amount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      transaction.transactionType === 'contribution' || 
                      transaction.transactionType === 'registration' || 
                      transaction.transactionType === 'renewal' || 
                      transaction.transactionType === 'penalty' || 
                      transaction.transactionType === 'wallet_funding'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {transaction.transactionType === 'contribution' 
                        ? 'Credit' 
                        : transaction.transactionType === 'disbursement'
                          ? 'Debit'
                          : transaction.transactionType.replace('_', ' ')}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4">
                  No transactions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AccountTransactionsList;
