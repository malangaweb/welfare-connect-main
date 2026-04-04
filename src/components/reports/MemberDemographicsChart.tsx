import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MemberDemographic } from './types';

interface MemberDemographicsChartProps {
  genderDistribution?: MemberDemographic[];
  residenceDistribution?: MemberDemographic[];
  statusDistribution?: MemberDemographic[];
  title?: string;
  description?: string;
}

const GENDER_COLORS = ['#3b82f6', '#ec4899']; // Blue for male, Pink for female
const STATUS_COLORS = ['#10b981', '#6b7280', '#f59e0b', '#ef4444']; // Green, Gray, Amber, Red

export function MemberDemographicsChart({ 
  genderDistribution,
  residenceDistribution,
  statusDistribution,
  title = "Member Demographics",
  description = "Distribution of members by various attributes"
}: MemberDemographicsChartProps) {
  const totalMembers = (genderDistribution || []).reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="space-y-6">
      {/* Gender Distribution Pie Chart */}
      {genderDistribution && genderDistribution.length > 0 && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Gender Distribution</CardTitle>
            <CardDescription>Breakdown by gender</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={genderDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      nameKey="label"
                    >
                      {genderDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || GENDER_COLORS[index % GENDER_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value} members`, 'Count']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col justify-center space-y-4">
                {genderDistribution.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: item.color || GENDER_COLORS[idx % GENDER_COLORS.length] }}
                      />
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{item.value}</p>
                      <p className="text-xs text-muted-foreground">
                        {totalMembers > 0 ? ((item.value / totalMembers) * 100).toFixed(1) : 0}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Distribution */}
      {statusDistribution && statusDistribution.length > 0 && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Member Status Distribution</CardTitle>
            <CardDescription>Active, inactive, and other statuses</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={statusDistribution} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="label" 
                  className="text-xs"
                  tick={{ fontSize: 12 }}
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
                  formatter={(value: number) => [`${value} members`, 'Count']}
                />
                <Legend />
                <Bar 
                  dataKey="value" 
                  name="Number of Members" 
                  radius={[4, 4, 0, 0]}
                >
                  {statusDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || STATUS_COLORS[index % STATUS_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Residences */}
      {residenceDistribution && residenceDistribution.length > 0 && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Members by Residence</CardTitle>
            <CardDescription>Top locations by member count</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart 
                data={residenceDistribution.slice(0, 10)} 
                layout="vertical"
                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  type="number" 
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  type="category"
                  dataKey="label" 
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
                  formatter={(value: number) => [`${value} members`, 'Count']}
                />
                <Legend />
                <Bar 
                  dataKey="value" 
                  name="Members" 
                  fill="#8b5cf6"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>

            {/* Summary */}
            <div className="mt-4 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-muted-foreground">Total Members</p>
                <p className="text-xl font-bold text-primary">{totalMembers}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unique Locations</p>
                <p className="text-xl font-bold text-purple-600">{residenceDistribution.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg per Location</p>
                <p className="text-xl font-bold text-green-600">
                  {residenceDistribution.length > 0 ? Math.round(totalMembers / residenceDistribution.length) : 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
