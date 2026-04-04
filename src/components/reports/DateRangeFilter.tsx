import { useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, subMonths, subQuarters, subYears, startOfDay, endOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DateRangeFilterProps {
  onApply: (startDate: Date, endDate: Date, preset?: 'month' | 'quarter' | 'year' | 'custom') => void;
  initialStartDate?: Date;
  initialEndDate?: Date;
}

export function DateRangeFilter({ 
  onApply,
  initialStartDate = subMonths(new Date(), 1),
  initialEndDate = new Date()
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<'month' | 'quarter' | 'year' | 'custom'>('month');
  const [startDate, setStartDate] = useState<Date>(initialStartDate);
  const [endDate, setEndDate] = useState<Date>(initialEndDate);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | undefined>({
    from: initialStartDate,
    to: initialEndDate
  });

  const applyPreset = (selectedRange: typeof range) => {
    setRange(selectedRange);
    const end = endOfDay(new Date());
    let start: Date;
    
    switch (selectedRange) {
      case 'month':
        start = startOfDay(subMonths(end, 1));
        break;
      case 'quarter':
        start = startOfDay(subQuarters(end, 1));
        break;
      case 'year':
        start = startOfDay(subYears(end, 1));
        break;
      default:
        start = initialStartDate;
    }
    
    setStartDate(start);
    setEndDate(end);
    setDateRange({ from: start, to: end });
    onApply(start, end, selectedRange);
    setOpen(false);
  };

  const handleDateSelect = (selectedRange: { from: Date; to: Date } | undefined) => {
    setDateRange(selectedRange);
    if (selectedRange?.from && selectedRange?.to) {
      setStartDate(startOfDay(selectedRange.from));
      setEndDate(endOfDay(selectedRange.to));
      setRange('custom');
    }
  };

  const handleApply = () => {
    if (dateRange?.from && dateRange?.to) {
      onApply(startOfDay(dateRange.from), endOfDay(dateRange.to), range);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="border-2 font-medium bg-white shadow-sm">
          <CalendarIcon className="h-4 w-4 mr-2" />
          {format(startDate, 'MMM dd, yyyy')} - {format(endDate, 'MMM dd, yyyy')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="end">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Quick Presets</p>
            <div className="flex gap-2">
              <Button 
                variant={range === 'month' ? 'default' : 'outline'} 
                size="sm" 
                onClick={() => applyPreset('month')}
                className="flex-1"
              >
                Last Month
              </Button>
              <Button 
                variant={range === 'quarter' ? 'default' : 'outline'} 
                size="sm" 
                onClick={() => applyPreset('quarter')}
                className="flex-1"
              >
                Last Quarter
              </Button>
              <Button 
                variant={range === 'year' ? 'default' : 'outline'} 
                size="sm" 
                onClick={() => applyPreset('year')}
                className="flex-1"
              >
                Last Year
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Custom Range</p>
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={handleDateSelect}
              numberOfMonths={2}
              className="rounded-md border"
              classNames={{
                months: "flex flex-col md:flex-row gap-4",
                month: "space-y-4",
                month_caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium",
                nav: "space-x-1 flex items-center",
                nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                nav_button_previous: "absolute left-1",
                nav_button_next: "absolute right-1",
                table: "w-full border-collapse space-y-1",
                head_row: "flex",
                head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
                row: "flex w-full mt-2",
                cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                day: "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
                day_range_end: "day-range-end",
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                day_today: "bg-accent text-accent-foreground",
                day_outside: "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
                day_disabled: "text-muted-foreground opacity-50",
                day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                day_hidden: "invisible",
              }}
              components={{
                IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                IconRight: () => <ChevronRight className="h-4 w-4" />,
              }}
            />
          </div>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              className="flex-1"
              onClick={handleApply}
              disabled={!dateRange?.from || !dateRange?.to}
            >
              Apply Filter
            </Button>
          </div>

          {dateRange?.from && dateRange?.to && (
            <div className="pt-2 border-t text-xs text-center text-muted-foreground">
              Selected: {format(dateRange.from, 'MMM dd, yyyy')} - {format(dateRange.to, 'MMM dd, yyyy')}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
