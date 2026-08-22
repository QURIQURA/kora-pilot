export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      components: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "components_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          ai_interpretation: string | null
          batch_multiplier: number
          component_id: string | null
          conclusion: string | null
          control_variables: string | null
          created_at: string
          date: string
          experiment_number: number | null
          formula_version_id: string | null
          hypothesis: string | null
          id: string
          mould_id: string | null
          next_experiment: string | null
          notes: string | null
          product_id: string | null
          result: string | null
          status: Database["public"]["Enums"]["experiment_status"]
          updated_at: string
          user_id: string
          variables: string | null
        }
        Insert: {
          ai_interpretation?: string | null
          batch_multiplier?: number
          component_id?: string | null
          conclusion?: string | null
          control_variables?: string | null
          created_at?: string
          date?: string
          experiment_number?: number | null
          formula_version_id?: string | null
          hypothesis?: string | null
          id?: string
          mould_id?: string | null
          next_experiment?: string | null
          notes?: string | null
          product_id?: string | null
          result?: string | null
          status?: Database["public"]["Enums"]["experiment_status"]
          updated_at?: string
          user_id: string
          variables?: string | null
        }
        Update: {
          ai_interpretation?: string | null
          batch_multiplier?: number
          component_id?: string | null
          conclusion?: string | null
          control_variables?: string | null
          created_at?: string
          date?: string
          experiment_number?: number | null
          formula_version_id?: string | null
          hypothesis?: string | null
          id?: string
          mould_id?: string | null
          next_experiment?: string | null
          notes?: string | null
          product_id?: string | null
          result?: string | null
          status?: Database["public"]["Enums"]["experiment_status"]
          updated_at?: string
          user_id?: string
          variables?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiments_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_formula_version_id_fkey"
            columns: ["formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_mould_id_fkey"
            columns: ["mould_id"]
            isOneToOne: false
            referencedRelation: "moulds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      formula_version_ingredients: {
        Row: {
          amount: number
          created_at: string
          formula_version_id: string
          id: string
          ingredient_id: string
          note: string | null
          sort_order: number
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          formula_version_id: string
          id?: string
          ingredient_id: string
          note?: string | null
          sort_order?: number
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          formula_version_id?: string
          id?: string
          ingredient_id?: string
          note?: string | null
          sort_order?: number
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "formula_version_ingredients_formula_version_id_fkey"
            columns: ["formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formula_version_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      formula_versions: {
        Row: {
          change_reason: string | null
          change_summary: string | null
          created_at: string
          default_mould_id: string | null
          formula_id: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["formula_status"]
          updated_at: string
          user_id: string
          version_number: number
          yield_quantity: number | null
        }
        Insert: {
          change_reason?: string | null
          change_summary?: string | null
          created_at?: string
          default_mould_id?: string | null
          formula_id: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["formula_status"]
          updated_at?: string
          user_id: string
          version_number?: number
          yield_quantity?: number | null
        }
        Update: {
          change_reason?: string | null
          change_summary?: string | null
          created_at?: string
          default_mould_id?: string | null
          formula_id?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["formula_status"]
          updated_at?: string
          user_id?: string
          version_number?: number
          yield_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "formula_versions_default_mould_id_fkey"
            columns: ["default_mould_id"]
            isOneToOne: false
            referencedRelation: "moulds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formula_versions_formula_id_fkey"
            columns: ["formula_id"]
            isOneToOne: false
            referencedRelation: "formulas"
            referencedColumns: ["id"]
          },
        ]
      }
      formulas: {
        Row: {
          component_id: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          component_id?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          component_id?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "formulas_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_function_links: {
        Row: {
          created_at: string
          function_id: string
          id: string
          ingredient_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          function_id: string
          id?: string
          ingredient_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          function_id?: string
          id?: string
          ingredient_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_function_links_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "ingredient_functions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_function_links_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_functions: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          brand: string | null
          category_id: string | null
          created_at: string
          default_unit: string
          id: string
          name: string
          notes: string | null
          supplier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          default_unit?: string
          id?: string
          name: string
          notes?: string | null
          supplier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          default_unit?: string
          id?: string
          name?: string
          notes?: string | null
          supplier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      moulds: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          shape_size: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          shape_size?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          shape_size?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      observations: {
        Row: {
          created_at: string
          experiment_id: string
          id: string
          label: string
          note: string | null
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          experiment_id: string
          id?: string
          label?: string
          note?: string | null
          user_id: string
          value?: string
        }
        Update: {
          created_at?: string
          experiment_id?: string
          id?: string
          label?: string
          note?: string | null
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "observations_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      product_components: {
        Row: {
          component_id: string
          created_at: string
          id: string
          product_id: string
          sort_order: number
          user_id: string
        }
        Insert: {
          component_id: string
          created_at?: string
          id?: string
          product_id: string
          sort_order?: number
          user_id: string
        }
        Update: {
          component_id?: string
          created_at?: string
          id?: string
          product_id?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          created_at: string
          id: string
          product_id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          notes: string | null
          product_target: Json
          status: Database["public"]["Enums"]["product_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          notes?: string | null
          product_target?: Json
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          notes?: string | null
          product_target?: Json
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      experiment_status:
        | "PLANNED"
        | "RUNNING"
        | "COMPLETE"
        | "FAILED"
        | "CANCELLED"
      formula_status:
        | "DRAFT"
        | "TESTING"
        | "CURRENT"
        | "SUPERSEDED"
        | "ARCHIVED"
      product_status: "IDEA" | "ACTIVE" | "TESTING" | "STABLE" | "ARCHIVED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      experiment_status: [
        "PLANNED",
        "RUNNING",
        "COMPLETE",
        "FAILED",
        "CANCELLED",
      ],
      formula_status: ["DRAFT", "TESTING", "CURRENT", "SUPERSEDED", "ARCHIVED"],
      product_status: ["IDEA", "ACTIVE", "TESTING", "STABLE", "ARCHIVED"],
    },
  },
} as const
