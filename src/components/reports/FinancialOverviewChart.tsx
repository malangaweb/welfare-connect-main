import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountBalance, MonthlyFinancial } from './types';

interface FinancialOverviewChartProps {
  accountBalances: AccountBalance[];
  monthlyFinancials?: MonthlyFinancial[];
  title?: string;
  description?: string;
}

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

export function FinancialOverviewChart({ 
  accountBalances,
  monthlyFinancials,
  title = "Financial Overview",
  description = "Account balances and fund distribution"
}: FinancialOverviewChartProps) {
  const totalLiquidity = accountBalances.reduce((sum, acc) => sum + acc.balance, 0);

  return (
    <div className="space-y-6">
      {/* Account Balances Bar Chart */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {accountBalances.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={accountBalances} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="name" 
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `KES ${value.toLocaleString()}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                  formatter={(value: number) => [`KES ${value.toLocaleString()}`, 'Balance']}
                />
                <Legend />
                <Bar 
                  dataKey="balance" 
                  name="Account Balance" 
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                >
                  {accountBalances.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">No account data available</p>
          )}

          {/* Summary Stats */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {accountBalances.map((acc, idx) => (
              <div key={idx} className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground truncate">{acc.name}</p>
                <p className="text-lg font-bold" style={{ color: acc.color || COLORS[idx % COLORS.length] }}>
                  KES {acc.balance.toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t">
            <div className="flex justify-between items-center">
              <span className="font-medium text-gray-700">Total System Liquidity</span>
              <span className="text-2xl font-black text-emerald-600">
                KES {totalLiquidity.toLocaleString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Income vs Disbursements */}
      {monthlyFinancials && monthlyFinancials.length > 0 && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Cash Flow Analysis</CardTitle>
            <CardDescription>Monthly income vs disbursements</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyFinancials} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `KES ${value.toLocaleString()}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`KES ${value.toLocaleString()}`]}
                />
                <Legend />
                <Bar 
                  dataKey="income" 
                  name="Income" 
                  fill="#10b981" 
                  radius={[4, 4, 0, 0]}
                />
                <Bar 
                  dataKey="disbursements" 
                  name="Disbursements" 
                  fill="#ef4444" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>

            {/* Net Summary */}
            <div className="mt-6 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-muted-foreground">Total Income</p>
                <p className="text-xl font-bold text-green-600">
                  KES {monthlyFinancials.reduce((sum, d) => sum + d.income, 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Disbursements</p>
                <p className="text-xl font-bold text-red-600">
                  KES {monthlyFinancials.reduce((sum, d) => sum + d.disbursements, 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Net Surplus</p>
                <p className={`text-xl font-bold ${
                  monthlyFinancials.reduce((sum, d) => sum + (d.income - d.disbursements), 0) >= 0 
                    ? 'text-green-600' 
                    : 'text-red-600'
                }`}>
                  KES {monthlyFinancials.reduce((sum, d) => sum + (d.income - d.disbursements), 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
