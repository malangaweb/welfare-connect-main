// Report data interfaces

export interface MonthlyContribution {
  month: string;
  amount: number;
  count: number;
}

export interface ContributionByType {
  type: string;
  amount: number;
  count: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  amount: number;
  percentage: number;
}

export interface MemberDemographic {
  label: string;
  value: number;
  color: string;
}

export interface DefaulterByLocation {
  residence: string;
  count: number;
  totalAmount: number;
}

export interface AccountBalance {
  name: string;
  balance: number;
  color: string;
}

export interface MonthlyFinancial {
  month: string;
  income: number;
  disbursements: number;
}

export interface ReportDateRange {
  startDate: Date;
  endDate: Date;
  preset?: 'month' | 'quarter' | 'year' | 'custom';
}
