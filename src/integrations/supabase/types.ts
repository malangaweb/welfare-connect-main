// Supabase Database Types
// Generated types for the database schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      members: {
        Row: {
          id: string
          member_number: string
          first_name: string | null
          last_name: string | null
          name: string
          gender: string | null
          date_of_birth: string | null
          national_id_number: string | null
          phone_number: string | null
          email_address: string | null
          residence: string | null
          residence_id: string | null
          next_of_kin: Json | null
          dependants: Json | null
          registration_date: string | null
          is_active: boolean
          wallet_balance: number
          last_login: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          member_number: string
          first_name?: string | null
          last_name?: string | null
          name: string
          gender?: string | null
          date_of_birth?: string | null
          national_id_number?: string | null
          phone_number?: string | null
          email_address?: string | null
          residence?: string | null
          residence_id?: string | null
          next_of_kin?: Json | null
          dependants?: Json | null
          registration_date?: string | null
          is_active?: boolean
          wallet_balance?: number
          last_login?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          member_number?: string
          first_name?: string | null
          last_name?: string | null
          name?: string
          gender?: string | null
          date_of_birth?: string | null
          national_id_number?: string | null
          phone_number?: string | null
          email_address?: string | null
          residence?: string | null
          residence_id?: string | null
          next_of_kin?: Json | null
          dependants?: Json | null
          registration_date?: string | null
          is_active?: boolean
          wallet_balance?: number
          last_login?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      dependants: {
        Row: {
          id: string
          member_id: string | null
          name: string
          gender: string | null
          relationship: string | null
          date_of_birth: string | null
          is_disabled: boolean
          is_eligible: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          member_id?: string | null
          name: string
          gender?: string | null
          relationship?: string | null
          date_of_birth?: string | null
          is_disabled?: boolean
          is_eligible?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          member_id?: string | null
          name?: string
          gender?: string | null
          relationship?: string | null
          date_of_birth?: string | null
          is_disabled?: boolean
          is_eligible?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      cases: {
        Row: {
          id: string
          case_number: string
          affected_member_id: string | null
          dependant_id: string | null
          case_type: string | null
          description: string | null
          contribution_per_member: number
          start_date: string | null
          end_date: string | null
          expected_amount: number | null
          actual_amount: number
          is_active: boolean
          is_finalized: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          case_number: string
          affected_member_id?: string | null
          dependant_id?: string | null
          case_type?: string | null
          description?: string | null
          contribution_per_member: number
          start_date?: string | null
          end_date?: string | null
          expected_amount?: number | null
          actual_amount?: number
          is_active?: boolean
          is_finalized?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          case_number?: string
          affected_member_id?: string | null
          dependant_id?: string | null
          case_type?: string | null
          description?: string | null
          contribution_per_member?: number
          start_date?: string | null
          end_date?: string | null
          expected_amount?: number | null
          actual_amount?: number
          is_active?: boolean
          is_finalized?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      transactions: {
        Row: {
          id: string
          member_id: string | null
          case_id: string | null
          amount: number
          transaction_type: string | null
          payment_method: string | null
          mpesa_reference: string | null
          description: string | null
          status: string | null
          metadata: Json | null
          reference: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          member_id?: string | null
          case_id?: string | null
          amount: number
          transaction_type?: string | null
          payment_method?: string | null
          mpesa_reference?: string | null
          description?: string | null
          status?: string | null
          metadata?: Json | null
          reference?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          member_id?: string | null
          case_id?: string | null
          amount?: number
          transaction_type?: string | null
          payment_method?: string | null
          mpesa_reference?: string | null
          description?: string | null
          status?: string | null
          metadata?: Json | null
          reference?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      users: {
        Row: {
          id: string
          username: string
          name: string
          email: string | null
          password: string
          role: string
          member_id: string | null
          is_active: boolean
          reset_token: string | null
          reset_token_expires: string | null
          last_password_change: string | null
          force_password_change: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          username: string
          name: string
          email?: string | null
          password: string
          role?: string
          member_id?: string | null
          is_active?: boolean
          reset_token?: string | null
          reset_token_expires?: string | null
          last_password_change?: string | null
          force_password_change?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          name?: string
          email?: string | null
          password?: string
          role?: string
          member_id?: string | null
          is_active?: boolean
          reset_token?: string | null
          reset_token_expires?: string | null
          last_password_change?: string | null
          force_password_change?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string | null
          member_id: string | null
          action: string
          table_name: string | null
          record_id: string | null
          status: string | null
          metadata: Json | null
          ip_address: string | null
          user_agent: string | null
          timestamp: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          member_id?: string | null
          action: string
          table_name?: string | null
          record_id?: string | null
          status?: string | null
          metadata?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          timestamp?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          member_id?: string | null
          action?: string
          table_name?: string | null
          record_id?: string | null
          status?: string | null
          metadata?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          timestamp?: string
        }
      }
      residences: {
        Row: {
          id: string
          name: string
          location: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          location?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          location?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      accounts: {
        Row: {
          id: string
          name: string
          type: string | null
          description: string | null
          balance: number
          is_system: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          type?: string | null
          description?: string | null
          balance?: number
          is_system?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: string | null
          description?: string | null
          balance?: number
          is_system?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      settings: {
        Row: {
          id: string
          organization_name: string
          organization_email: string | null
          organization_phone: string | null
          registration_fee: number
          renewal_fee: number
          penalty_amount: number
          paybill_number: string | null
          member_id_start: number | null
          case_id_start: number | null
          mpesa_consumer_key: string | null
          mpesa_consumer_secret: string | null
          mpesa_passkey: string | null
          mpesa_shortcode: string | null
          mpesa_initiator_name: string | null
          mpesa_initiator_password: string | null
          mpesa_env: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_name?: string
          organization_email?: string | null
          organization_phone?: string | null
          registration_fee?: number
          renewal_fee?: number
          penalty_amount?: number
          paybill_number?: string | null
          member_id_start?: number | null
          case_id_start?: number | null
          mpesa_consumer_key?: string | null
          mpesa_consumer_secret?: string | null
          mpesa_passkey?: string | null
          mpesa_shortcode?: string | null
          mpesa_initiator_name?: string | null
          mpesa_initiator_password?: string | null
          mpesa_env?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_name?: string
          organization_email?: string | null
          organization_phone?: string | null
          registration_fee?: number
          renewal_fee?: number
          penalty_amount?: number
          paybill_number?: string | null
          member_id_start?: number | null
          case_id_start?: number | null
          mpesa_consumer_key?: string | null
          mpesa_consumer_secret?: string | null
          mpesa_passkey?: string | null
          mpesa_shortcode?: string | null
          mpesa_initiator_name?: string | null
          mpesa_initiator_password?: string | null
          mpesa_env?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
