
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

const StatsCard = ({ 
  title, 
  value, 
  icon, 
  description, 
  trend, 
  className 
}: StatsCardProps) => {
  return (
    <Card className={cn("border-none shadow-sm hover:shadow-md transition-all duration-300 bg-white group", className)}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex justify-between items-start mb-3 sm:mb-4 gap-3">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-medium text-slate-500 mb-1 leading-tight break-words sm:truncate">{title}</p>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight break-words">{value}</div>
          </div>
          <div className="h-8 sm:h-10 w-8 sm:w-10 rounded-xl bg-slate-50 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300 shadow-sm flex-shrink-0">
            <div className="w-4 h-4 sm:w-5 sm:h-5">{icon}</div>
          </div>
        </div>

        <div className="flex items-end justify-between mt-2 gap-2">
          <div className="flex flex-col min-w-0">
            {trend && (
              <div className="flex items-center mb-1 flex-wrap">
                <span className={cn(
                  "text-xs font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 mr-1 flex-shrink-0",
                  trend.isPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                )}>
                  {trend.isPositive ? '↑' : '↓'} {trend.value}%
                </span>
                <span className="text-[10px] sm:text-[11px] font-medium text-slate-400 whitespace-nowrap">Last Week</span>
              </div>
            )}
            {description && !trend && (
              <p className="text-[10px] sm:text-[11px] font-medium text-slate-400 break-words sm:truncate">{description}</p>
            )}
          </div>
          
          {/* Mock Sparkline SVG to match design - Hidden on small screens */}
          <div className="w-12 sm:w-16 h-6 sm:h-8 opacity-60 flex-shrink-0 hidden sm:block">
            <svg viewBox="0 0 100 40" className="w-full h-full overflow-visible">
              <path
                d={trend?.isPositive 
                  ? "M0,35 C20,30 30,15 50,20 S80,5 100,10" 
                  : "M0,10 C20,15 30,30 50,25 S80,35 100,30"}
                fill="none"
                stroke={trend?.isPositive ? "#10b981" : "#f43f5e"}
                strokeWidth="2.5"
                strokeLinecap="round"
                className="drop-shadow-sm"
              />
            </svg>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StatsCard;
