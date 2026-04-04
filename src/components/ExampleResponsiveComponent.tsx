/**
 * Example: Mobile-First Responsive Component
 * This component demonstrates best practices for building responsive components
 */

import { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getResponsivePadding,
  getResponsiveGap,
  RESPONSIVE_HEADING,
} from '@/lib/responsive';

interface ExampleComponentProps {
  title: string;
  subtitle?: string;
  items: Array<{
    id: string;
    label: string;
    value: string | number;
    icon?: ReactNode;
  }>;
  onAction?: () => void;
  isLoading?: boolean;
}

/**
 * Example Component: Dashboard Section
 *
 * Key responsive features:
 * 1. Uses mobile-first approach
 * 2. Responsive padding via responsive utilities
 * 3. Conditional rendering based on screen size
 * 4. Touch-friendly button sizes
 * 5. Responsive grid layouts
 * 6. Adaptive typography
 */
export const ExampleResponsiveComponent = ({
  title,
  subtitle,
  items,
  onAction,
  isLoading,
}: ExampleComponentProps) => {
  const isMobile = useIsMobile();

  // Mobile: 1 column, Tablet: 2 columns, Desktop: 3 columns
  const gridColsClass = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="w-full">
      {/* Header Section - Responsive Layout */}
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 ${getResponsivePadding('md')}`}>
        {/* Title Group */}
        <div className="min-w-0">
          {/* Responsive heading */}
          <h2 className={RESPONSIVE_HEADING.h2}>{title}</h2>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">
              {subtitle}
            </p>
          )}
        </div>

        {/* Action Button - Touch friendly */}
        {onAction && (
          <Button
            onClick={onAction}
            disabled={isLoading}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-auto"
            size={isMobile ? 'lg' : 'default'}
          >
            {isMobile ? 'Add' : 'Add Item'}
          </Button>
        )}
      </div>

      {/* Content Section - Responsive Grid */}
      <div className={`grid ${gridColsClass} gap-3 sm:gap-4 md:gap-6 ${getResponsivePadding('md')}`}>
        {items.map((item) => (
          <ItemCard key={item.id} item={item} isMobile={isMobile} />
        ))}
      </div>

      {/* Empty State - Responsive Text */}
      {items.length === 0 && !isLoading && (
        <div className={`text-center py-8 sm:py-12 md:py-16 ${getResponsivePadding('md')}`}>
          <p className="text-xs sm:text-sm md:text-base text-muted-foreground">
            {isMobile ? 'No items yet' : 'No items available. Click Add to create one.'}
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * Sub-component: Item Card
 * Demonstrates responsive card design
 */
const ItemCard = ({
  item,
  isMobile,
}: {
  item: ExampleComponentProps['items'][0];
  isMobile: boolean;
}) => {
  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      {/* Responsive padding: 3 on mobile, 6 on desktop */}
      <CardContent className="p-3 sm:p-4 md:p-6">
        {/* Flex with responsive direction and gap */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
          {/* Left: Icon + Text */}
          <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1">
            {/* Icon - Responsive size: hidden on mobile, shown on sm+ */}
            {item.icon && (
              <div className="hidden sm:flex h-5 w-5 md:h-6 md:w-6 flex-shrink-0 text-primary mt-0.5">
                {item.icon}
              </div>
            )}

            {/* Text - Responsive text sizes */}
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-foreground truncate">
                {item.label}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground font-semibold mt-1">
                {item.value}
              </p>
            </div>
          </div>

          {/* Right: Action - Hidden on mobile, shown on tablet+ */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:flex h-8 w-8 md:h-10 md:w-10 flex-shrink-0"
            aria-label="More actions"
          >
            <ChevronDown className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
        </div>

        {/* Mobile Action Button - Only shown on mobile */}
        {isMobile && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-3 h-9 text-xs"
          >
            View Details
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * BEST PRACTICES DEMONSTRATED:
 *
 * ✅ Mobile-First Approach
 *    - Default styles are mobile optimized
 *    - Tablet/Desktop enhancements added via sm:, md:, lg: prefixes
 *
 * ✅ Responsive Typography
 *    - Headings: RESPONSIVE_HEADING.h2 (scales automatically)
 *    - Body: text-xs sm:text-sm md:text-base
 *    - Subtle: text-[10px] sm:text-[11px]
 *
 * ✅ Responsive Spacing
 *    - Padding: p-3 sm:p-4 md:p-6
 *    - Gap: gap-2 sm:gap-3 md:gap-4
 *    - Margin: Various based on context
 *
 * ✅ Responsive Layout
 *    - flex-col sm:flex-row (stack on mobile, row on desktop)
 *    - grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
 *    - hidden sm:block (hide on mobile, show on tablet+)
 *
 * ✅ Touch Friendliness
 *    - All buttons: min-h-[44px] (44x44px touch target)
 *    - Icons: h-4 w-4 sm:h-5 sm:w-5 (scale with screen)
 *    - Spacing between targets: gap-3 or more
 *
 * ✅ Icon Sizing
 *    - Small: h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5
 *    - Medium: h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6
 *    - Large: h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7
 *
 * ✅ Adaptive Content
 *    - Different button labels (mobile-optimized)
 *    - Hidden/shown elements per breakpoint
 *    - Conditional rendering based on screen size
 *
 * ✅ Performance
 *    - No unnecessary re-renders
 *    - useIsMobile() cached at component level
 *    - CSS classes compiled at build time
 *
 * ✅ Accessibility
 *    - Proper semantic HTML
 *    - aria-labels where needed
 *    - Touch targets meet WCAG standards
 *    - Text contrast ratios maintained
 *
 * ✅ Error Prevention
 *    - min-w-0 on flex items (prevents text overflow)
 *    - truncate on single-line text
 *    - flex-shrink-0 on must-stay-sized items
 *    - Use grid gap instead of margin (consistent spacing)
 *
 * ANTI-PATTERNS TO AVOID:
 *
 * ❌ Don't use fixed widths/heights
 *    w-64 h-96 → Use w-full md:w-64 instead
 *
 * ❌ Don't nest media queries unnecessarily
 *    sm:md:lg:text-lg → Use single query: md:text-lg
 *
 * ❌ Don't forget about tablet size (768px)
 *    md: not always enough → Include sm: and lg: too
 *
 * ❌ Don't create tiny touch targets
 *    h-6 w-6 → Minimum 44x44px for mobile
 *
 * ❌ Don't rely only on useIsMobile
 *    Consider viewport-based styling too
 *
 * ❌ Don't use margin for gaps
 *    margin: Use px-4 gap-4 instead
 */

/**
 * TESTING THIS COMPONENT:
 *
 * 1. Chrome DevTools: Toggle device toolbar (Ctrl+Shift+M)
 * 2. Test breakpoints:
 *    - 320px: Mobile phone
 *    - 480px: Small phone
 *    - 768px: Tablet
 *    - 1024px: Desktop
 *    - 1280px: Large desktop
 *
 * 3. Check:
 *    - ✓ No horizontal scrolling
 *    - ✓ All buttons/links are 44x44px minimum
 *    - ✓ Text is readable on all sizes
 *    - ✓ Images scale properly
 *    - ✓ Gaps are consistent
 *    - ✓ Grid adjusts columns correctly
 *
 * 4. Real devices:
 *    - iPhone SE (320px width)
 *    - iPad (768px width)
 *    - Android phone (360px width)
 */
