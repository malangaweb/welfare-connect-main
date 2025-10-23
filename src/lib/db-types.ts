
// Database model interfaces for type safety when working with Supabase responses
// These types should match the database schema

import { Member, Case, Gender, CaseType, Dependant, NextOfKin } from '@/lib/types';

// Add email field to database user type
export interface DbUser {
  id: string;
  username: string;
  name: string;
  email?: string;
  role: string;
  member_id?: string;
  is_active: boolean;
  created_at: string;
}

// Member Types
export interface DbMember {
  id: string;
  member_number: string;
  name: string;
  gender: string;
  date_of_birth: string;
  national_id_number: string;
  phone_number: string | null;
  email_address: string | null;
  residence: string;
  next_of_kin: any;
  registration_date: string;
  wallet_balance: number;
  is_active: boolean;
}

export interface DbDependant {
  id: string;
  member_id: string;
  name: string;
  gender: string;
  relationship: string;
  date_of_birth: string;
  is_disabled: boolean;
  is_eligible: boolean;
}

// Case Types
export interface DbCase {
  id: string;
  case_number: string;
  affected_member_id: string;
  case_type: string;
  dependant_id: string | null;
  contribution_per_member: number;
  start_date: string;
  end_date: string;
  expected_amount: number;
  actual_amount: number;
  is_active: boolean;
  is_finalized: boolean;
  created_at: string;
}

// Settings Type
export interface DbSettings {
  id: string;
  registration_fee: number;
  renewal_fee: number;
  penalty_amount: number;
  paybill_number: string | null;
  organization_name: string;
  organization_email: string | null;
  organization_phone: string | null;
  member_id_start: number | null;
  case_id_start: number | null;
}

// Helper function to convert DB member to domain Member model
export function mapDbMemberToMember(dbMember: DbMember, dependants: DbDependant[] = []): Member {
  try {
    return {
      id: dbMember.id,
      memberNumber: dbMember.member_number,
      name: dbMember.name,
      gender: dbMember.gender as Gender,
      dateOfBirth: new Date(dbMember.date_of_birth),
      nationalIdNumber: dbMember.national_id_number,
      phoneNumber: dbMember.phone_number,
      emailAddress: dbMember.email_address,
      residence: dbMember.residence,
      nextOfKin: dbMember.next_of_kin as NextOfKin,
      dependants: dependants.map(dep => ({
        id: dep.id,
        name: dep.name,
        gender: dep.gender as Gender,
        relationship: dep.relationship,
        dateOfBirth: new Date(dep.date_of_birth),
        isDisabled: dep.is_disabled,
        isEligible: dep.is_eligible,
      })),
      registrationDate: new Date(dbMember.registration_date),
      walletBalance: Number(dbMember.wallet_balance || 0),
      isActive: dbMember.is_active,
    };
  } catch (error) {
    console.error('Error in mapDbMemberToMember:', error);
    console.error('dbMember data:', dbMember);
    throw error;
  }
}

// Helper function to convert DB case to domain Case model
export function mapDbCaseToCase(dbCase: DbCase, affectedMember?: DbMember): Case {
  return {
    id: dbCase.id,
    caseNumber: dbCase.case_number,
    affectedMemberId: dbCase.affected_member_id,
    affectedMember: affectedMember ? mapDbMemberToMember(affectedMember) : undefined,
    caseType: dbCase.case_type.toUpperCase() as CaseType,
    dependantId: dbCase.dependant_id,
    contributionPerMember: Number(dbCase.contribution_per_member),
    startDate: new Date(dbCase.start_date),
    endDate: new Date(dbCase.end_date),
    expectedAmount: Number(dbCase.expected_amount),
    actualAmount: Number(dbCase.actual_amount),
    isActive: dbCase.is_active,
    isFinalized: dbCase.is_finalized,
    createdAt: new Date(dbCase.created_at),
  };
}
