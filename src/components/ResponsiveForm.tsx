import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveFormProps extends HTMLAttributes<HTMLFormElement> {
  children: React.ReactNode;
  columns?: 'single' | 'dual' | 'triple';
  className?: string;
}

export const ResponsiveForm = ({
  children,
  columns = 'dual',
  className,
  ...props
}: ResponsiveFormProps) => {
  const gridClass = {
    single: 'grid-cols-1',
    dual: 'grid-cols-1 sm:grid-cols-2',
    triple: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  }[columns];

  return (
    <form
      className={cn('space-y-4 sm:space-y-6', className)}
      {...props}
    >
      {children}
    </form>
  );
};

interface ResponsiveFormGroupProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  columns?: 'single' | 'dual' | 'triple';
  className?: string;
}

export const ResponsiveFormGroup = ({
  children,
  columns = 'dual',
  className,
  ...props
}: ResponsiveFormGroupProps) => {
  const gridClass = {
    single: 'grid-cols-1',
    dual: 'grid-cols-1 sm:grid-cols-2',
    triple: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  }[columns];

  return (
    <div
      className={cn(`grid ${gridClass} gap-3 sm:gap-4 md:gap-6`, className)}
      {...props}
    >
      {children}
    </div>
  );
};

interface ResponsiveFormFieldProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export const ResponsiveFormField = ({
  label,
  required,
  error,
  hint,
  children,
  className,
  ...props
}: ResponsiveFormFieldProps) => {
  return (
    <div className={cn('space-y-1', className)} {...props}>
      {label && (
        <label className="block text-xs sm:text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}
      <div className="text-sm">{children}</div>
      {error && (
        <p className="text-xs text-destructive font-medium">{error}</p>
      )}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
};
