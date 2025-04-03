export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          balance: number
          case_id: string | null
          created_at: string
          id: string
          name: string
          type: string
          year: number | null
        }
        Insert: {
          balance?: number
          case_id?: string | null
          created_at?: string
          id?: string
          name: string
          type: string
          year?: number | null
        }
        Update: {
          balance?: number
          case_id?: string | null
          created_at?: string
          id?: string
          name?: string
          type?: string
          year?: number | null
        }
        Relationships: []
      }
      cases: {
        Row: {
          actual_amount: number | null
          affected_member_id: string
          case_number: string
          case_type: string
          contribution_per_member: number
          created_at: string | null
          dependant_id: string | null
          end_date: string
          expected_amount: number
          id: string
          is_active: boolean | null
          is_finalized: boolean | null
          start_date: string
        }
        Insert: {
          actual_amount?: number | null
          affected_member_id: string
          case_number: string
          case_type: string
          contribution_per_member: number
          created_at?: string | null
          dependant_id?: string | null
          end_date: string
          expected_amount: number
          id?: string
          is_active?: boolean | null
          is_finalized?: boolean | null
          start_date: string
        }
        Update: {
          actual_amount?: number | null
          affected_member_id?: string
          case_number?: string
          case_type?: string
          contribution_per_member?: number
          created_at?: string | null
          dependant_id?: string | null
          end_date?: string
          expected_amount?: number
          id?: string
          is_active?: boolean | null
          is_finalized?: boolean | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_affected_member_id_fkey"
            columns: ["affected_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_dependant_id_fkey"
            columns: ["dependant_id"]
            isOneToOne: false
            referencedRelation: "dependants"
            referencedColumns: ["id"]
          },
        ]
      }
      dependants: {
        Row: {
          date_of_birth: string
          gender: string
          id: string
          is_disabled: boolean | null
          is_eligible: boolean | null
          member_id: string
          name: string
          relationship: string
        }
        Insert: {
          date_of_birth: string
          gender: string
          id?: string
          is_disabled?: boolean | null
          is_eligible?: boolean | null
          member_id: string
          name: string
          relationship: string
        }
        Update: {
          date_of_birth?: string
          gender?: string
          id?: string
          is_disabled?: boolean | null
          is_eligible?: boolean | null
          member_id?: string
          name?: string
          relationship?: string
        }
        Relationships: [
          {
            foreignKeyName: "dependants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          date_of_birth: string
          email_address: string | null
          gender: string
          id: string
          is_active: boolean | null
          member_number: string
          name: string
          national_id_number: string
          next_of_kin: Json
          phone_number: string | null
          registration_date: string | null
          residence: string
          wallet_balance: number | null
        }
        Insert: {
          date_of_birth: string
          email_address?: string | null
          gender: string
          id?: string
          is_active?: boolean | null
          member_number: string
          name: string
          national_id_number: string
          next_of_kin: Json
          phone_number?: string | null
          registration_date?: string | null
          residence: string
          wallet_balance?: number | null
        }
        Update: {
          date_of_birth?: string
          email_address?: string | null
          gender?: string
          id?: string
          is_active?: boolean | null
          member_number?: string
          name?: string
          national_id_number?: string
          next_of_kin?: Json
          phone_number?: string | null
          registration_date?: string | null
          residence?: string
          wallet_balance?: number | null
        }
        Relationships: []
      }
      residences: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          case_id_start: number | null
          id: string
          member_id_start: number | null
          organization_email: string | null
          organization_name: string
          organization_phone: string | null
          paybill_number: string | null
          penalty_amount: number
          registration_fee: number
          renewal_fee: number
        }
        Insert: {
          case_id_start?: number | null
          id?: string
          member_id_start?: number | null
          organization_email?: string | null
          organization_name?: string
          organization_phone?: string | null
          paybill_number?: string | null
          penalty_amount?: number
          registration_fee?: number
          renewal_fee?: number
        }
        Update: {
          case_id_start?: number | null
          id?: string
          member_id_start?: number | null
          organization_email?: string | null
          organization_name?: string
          organization_phone?: string | null
          paybill_number?: string | null
          penalty_amount?: number
          registration_fee?: number
          renewal_fee?: number
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          case_id: string | null
          created_at: string
          description: string | null
          id: string
          member_id: string
          mpesa_reference: string | null
          transaction_type: string
        }
        Insert: {
          amount: number
          case_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          member_id: string
          mpesa_reference?: string | null
          transaction_type: string
        }
        Update: {
          amount?: number
          case_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          member_id?: string
          mpesa_reference?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credentials: {
        Row: {
          created_at: string
          id: string
          password: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          password: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          password?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          member_id: string | null
          name: string
          role: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          member_id?: string | null
          name: string
          role: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          member_id?: string | null
          name?: string
          role?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      update_case_id_start: {
        Args: {
          new_id: number
        }
        Returns: undefined
      }
      update_member_id_start: {
        Args: {
          new_id: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
