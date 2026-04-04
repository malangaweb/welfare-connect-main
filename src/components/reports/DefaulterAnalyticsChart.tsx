import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DefaulterByLocation } from './types';

interface DefaulterAnalyticsChartProps {
  byLocation: DefaulterByLocation[];
  totalDefaulters?: number;
  totalAmountOwed?: number;
  title?: string;
  description?: string;
}

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6'];

export function DefaulterAnalyticsChart({ 
  byLocation,
  totalDefaulters,
  totalAmountOwed,
  title = "Defaulters Analytics",
  description = "Analysis of members with negative balances"
}: DefaulterAnalyticsChartProps) {
  const sortedByLocation = [...byLocation].sort((a, b) => b.count - a.count).slice(0, 10);
  const sortedByAmount = [...byLocation].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Total Defaulters</p>
              <p className="text-3xl font-black text-red-600">{totalDefaulters || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Total Amount Owed</p>
              <p className="text-3xl font-black text-amber-600">
                KES {(totalAmountOwed || 0).toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Avg Debt per Defaulter</p>
              <p className="text-3xl font-black text-orange-600">
                KES {totalDefaulters && totalDefaulters > 0 
                  ? Math.round((totalAmountOwed || 0) / totalDefaulters).toLocaleString() 
                  : 0}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Defaulters by Location - Bar Chart */}
      {sortedByLocation.length > 0 && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Defaulters by Location</CardTitle>
            <CardDescription>Top 10 locations by number of defaulters</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sortedByLocation} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="residence" 
                  className="text-xs"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === 'Count') return [value.toString(), 'Defaulters'];
                    return [`KES ${value.toLocaleString()}`, 'Total Owed'];
                  }}
                />
                <Legend />
                <Bar 
                  dataKey="count" 
                  name="Count" 
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Amount Owed by Location - Horizontal Bar */}
      {sortedByAmount.length > 0 && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Outstanding Amounts by Location</CardTitle>
            <CardDescription>Top 10 locations by total amount owed</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart 
                data={sortedByAmount} 
                layout="vertical"
                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  type="number" 
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `KES ${(value / 1000).toFixed(0)}k`}
                />
                <YAxis 
                  type="category"
                  dataKey="residence" 
                  className="text-xs"
                  tick={{ fontSize: 11 }}
                  width={100}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`KES ${value.toLocaleString()}`, 'Amount Owed']}
                />
                <Legend />
                <Bar 
                  dataKey="totalAmount" 
                  name="Amount Owed (KES)" 
                  fill="#f59e0b"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Distribution Pie Chart */}
      {byLocation.length > 0 && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Defaulter Distribution</CardTitle>
            <CardDescription>Percentage share by location</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={sortedByLocation}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ residence, percent }) => `${residence.substring(0, 10)}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                      nameKey="residence"
                    >
                      {sortedByLocation.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value} defaulters`, 'Count']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-y-auto max-h-[250px] space-y-2">
                {sortedByLocation.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                      <span className="text-sm font-medium truncate max-w-[120px]">{item.residence}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{item.count}</p>
                      <p className="text-xs text-muted-foreground">
                        KES {item.totalAmount.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
