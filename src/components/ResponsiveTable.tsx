import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';

type TableRow = {
  id: string | number;
  cells: ReactNode[];
  onClick?: () => void;
  className?: string;
};

interface ResponsiveTableProps {
  headers: string[];
  rows: TableRow[];
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  mobileCardRender?: (row: TableRow, index: number) => ReactNode;
}

export const ResponsiveTable = ({
  headers,
  rows,
  isLoading,
  emptyMessage = 'No data available',
  className,
  mobileCardRender,
}: ResponsiveTableProps) => {
  const isMobile = useIsMobile();

  // Mobile card view
  if (isMobile && mobileCardRender) {
    return (
      <div className="space-y-3">
        {rows.length === 0 ? (
          <Card className="border-none shadow-sm">
            <CardContent className="p-4 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </CardContent>
          </Card>
        ) : (
          rows.map((row, index) => (
            <div
              key={row.id}
              onClick={row.onClick}
              className={cn(
                'cursor-pointer transition-all',
                row.className
              )}
            >
              {mobileCardRender(row, index)}
            </div>
          ))
        )}
      </div>
    );
  }

  // Desktop table view
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/50">
            {headers.map((header, index) => (
              <th
                key={index}
                className="px-4 py-3 text-left font-semibold text-slate-700 whitespace-nowrap"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length}
                className="px-4 py-8 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                onClick={row.onClick}
                className={cn(
                  'border-b border-slate-50 hover:bg-slate-50/50 transition-colors',
                  row.onClick && 'cursor-pointer',
                  row.className
                )}
              >
                {row.cells.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-4">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
