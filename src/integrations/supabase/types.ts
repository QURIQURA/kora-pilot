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
      base_weight_presets: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string
          weight_g: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
          weight_g: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          weight_g?: number
        }
        Relationships: []
      }
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
      component_cost_items: {
        Row: {
          component_id: string
          cost_item_id: string
          created_at: string
          id: string
          quantity: number
          user_id: string
        }
        Insert: {
          component_id: string
          cost_item_id: string
          created_at?: string
          id?: string
          quantity?: number
          user_id?: string
        }
        Update: {
          component_id?: string
          cost_item_id?: string
          created_at?: string
          id?: string
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "component_cost_items_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_cost_items_cost_item_id_fkey"
            columns: ["cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
        ]
      }
      components: {
        Row: {
          auto_apply_default_workflow: boolean
          created_at: string
          default_workflow_template_id: string | null
          description: string | null
          id: string
          name: string
          notes: string | null
          pinned: boolean
          scaling_mode: string
          technique_category_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_apply_default_workflow?: boolean
          created_at?: string
          default_workflow_template_id?: string | null
          description?: string | null
          id?: string
          name: string
          notes?: string | null
          pinned?: boolean
          scaling_mode?: string
          technique_category_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_apply_default_workflow?: boolean
          created_at?: string
          default_workflow_template_id?: string | null
          description?: string | null
          id?: string
          name?: string
          notes?: string | null
          pinned?: boolean
          scaling_mode?: string
          technique_category_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "components_default_workflow_template_id_fkey"
            columns: ["default_workflow_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "components_technique_category_id_fkey"
            columns: ["technique_category_id"]
            isOneToOne: false
            referencedRelation: "technique_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_item_history: {
        Row: {
          changed_at: string
          cost_item_id: string
          id: string
          new_cost: number
          note: string | null
          previous_cost: number | null
          user_id: string
        }
        Insert: {
          changed_at?: string
          cost_item_id: string
          id?: string
          new_cost: number
          note?: string | null
          previous_cost?: number | null
          user_id?: string
        }
        Update: {
          changed_at?: string
          cost_item_id?: string
          id?: string
          new_cost?: number
          note?: string | null
          previous_cost?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_item_history_cost_item_id_fkey"
            columns: ["cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_items: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          notes: string | null
          unit_cost: number
          unit_label: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          unit_cost?: number
          unit_label?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          unit_cost?: number
          unit_label?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      experiment_sensory_scores: {
        Row: {
          attribute_id: string
          created_at: string
          experiment_id: string
          id: string
          note: string | null
          score: number
          user_id: string
        }
        Insert: {
          attribute_id: string
          created_at?: string
          experiment_id: string
          id?: string
          note?: string | null
          score: number
          user_id: string
        }
        Update: {
          attribute_id?: string
          created_at?: string
          experiment_id?: string
          id?: string
          note?: string | null
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_sensory_scores_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "sensory_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_sensory_scores_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          ai_interpretation: string | null
          baseline_experiment_id: string | null
          batch_multiplier: number
          component_id: string | null
          conclusion: string | null
          control_variables: string | null
          created_at: string
          date: string
          experiment_number: number | null
          finished_weight_g: number | null
          formula_version_id: string | null
          hypothesis: string | null
          id: string
          mould_id: string | null
          next_experiment: string | null
          notes: string | null
          outcome: Database["public"]["Enums"]["development_outcome"] | null
          processed_weight_g: number | null
          product_id: string | null
          raw_weight_g: number | null
          result: string | null
          status: Database["public"]["Enums"]["experiment_status"]
          updated_at: string
          user_id: string
          variables: string | null
          work_session_id: string | null
        }
        Insert: {
          ai_interpretation?: string | null
          baseline_experiment_id?: string | null
          batch_multiplier?: number
          component_id?: string | null
          conclusion?: string | null
          control_variables?: string | null
          created_at?: string
          date?: string
          experiment_number?: number | null
          finished_weight_g?: number | null
          formula_version_id?: string | null
          hypothesis?: string | null
          id?: string
          mould_id?: string | null
          next_experiment?: string | null
          notes?: string | null
          outcome?: Database["public"]["Enums"]["development_outcome"] | null
          processed_weight_g?: number | null
          product_id?: string | null
          raw_weight_g?: number | null
          result?: string | null
          status?: Database["public"]["Enums"]["experiment_status"]
          updated_at?: string
          user_id: string
          variables?: string | null
          work_session_id?: string | null
        }
        Update: {
          ai_interpretation?: string | null
          baseline_experiment_id?: string | null
          batch_multiplier?: number
          component_id?: string | null
          conclusion?: string | null
          control_variables?: string | null
          created_at?: string
          date?: string
          experiment_number?: number | null
          finished_weight_g?: number | null
          formula_version_id?: string | null
          hypothesis?: string | null
          id?: string
          mould_id?: string | null
          next_experiment?: string | null
          notes?: string | null
          outcome?: Database["public"]["Enums"]["development_outcome"] | null
          processed_weight_g?: number | null
          product_id?: string | null
          raw_weight_g?: number | null
          result?: string | null
          status?: Database["public"]["Enums"]["experiment_status"]
          updated_at?: string
          user_id?: string
          variables?: string | null
          work_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiments_baseline_experiment_id_fkey"
            columns: ["baseline_experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "experiments_work_session_id_fkey"
            columns: ["work_session_id"]
            isOneToOne: false
            referencedRelation: "work_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      flavour_families: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          name_en: string | null
          notes: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          name_en?: string | null
          notes?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          name_en?: string | null
          notes?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      formula_version_batches: {
        Row: {
          created_at: string
          formula_version_id: string
          id: string
          label: string | null
          multiplier: number
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          formula_version_id: string
          id?: string
          label?: string | null
          multiplier?: number
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          formula_version_id?: string
          id?: string
          label?: string | null
          multiplier?: number
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "formula_version_batches_formula_version_id_fkey"
            columns: ["formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      formula_version_ingredients: {
        Row: {
          amount: number
          amount_source: string
          created_at: string
          formula_version_id: string
          id: string
          ingredient_id: string
          note: string | null
          secondary_amount: number | null
          secondary_unit: string | null
          sort_order: number
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          amount_source?: string
          created_at?: string
          formula_version_id: string
          id?: string
          ingredient_id: string
          note?: string | null
          secondary_amount?: number | null
          secondary_unit?: string | null
          sort_order?: number
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          amount_source?: string
          created_at?: string
          formula_version_id?: string
          id?: string
          ingredient_id?: string
          note?: string | null
          secondary_amount?: number | null
          secondary_unit?: string | null
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
          basis_overrides: Json
          bath_water_g: number | null
          change_reason: string | null
          change_summary: string | null
          created_at: string
          default_base_weight_id: string | null
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
          basis_overrides?: Json
          bath_water_g?: number | null
          change_reason?: string | null
          change_summary?: string | null
          created_at?: string
          default_base_weight_id?: string | null
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
          basis_overrides?: Json
          bath_water_g?: number | null
          change_reason?: string | null
          change_summary?: string | null
          created_at?: string
          default_base_weight_id?: string | null
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
            foreignKeyName: "formula_versions_default_base_weight_id_fkey"
            columns: ["default_base_weight_id"]
            isOneToOne: false
            referencedRelation: "base_weight_presets"
            referencedColumns: ["id"]
          },
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
          derived_from_formula_id: string | null
          id: string
          is_base_formula: boolean
          method_id: string | null
          name: string
          notes: string | null
          technique_category_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          component_id?: string | null
          created_at?: string
          derived_from_formula_id?: string | null
          id?: string
          is_base_formula?: boolean
          method_id?: string | null
          name: string
          notes?: string | null
          technique_category_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          component_id?: string | null
          created_at?: string
          derived_from_formula_id?: string | null
          id?: string
          is_base_formula?: boolean
          method_id?: string | null
          name?: string
          notes?: string | null
          technique_category_id?: string | null
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
          {
            foreignKeyName: "formulas_derived_from_formula_id_fkey"
            columns: ["derived_from_formula_id"]
            isOneToOne: false
            referencedRelation: "formulas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formulas_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formulas_technique_category_id_fkey"
            columns: ["technique_category_id"]
            isOneToOne: false
            referencedRelation: "technique_categories"
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
          color: string
          created_at: string
          id: string
          is_default: boolean
          key: string | null
          name: string
          name_en: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          key?: string | null
          name: string
          name_en?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          key?: string | null
          name?: string
          name_en?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          aroma_notes: string[] | null
          bloom: number | null
          brand: string | null
          category_id: string | null
          comp_alcohol: number | null
          comp_fat: number | null
          comp_other_solids: number | null
          comp_protein: number | null
          comp_sugar: number | null
          comp_water: number | null
          composition_source: string | null
          created_at: string
          default_unit: string
          fat_type: string | null
          flavour_family_id: string | null
          flavour_intensity: number | null
          flavour_note: string | null
          id: string
          ingredient_declaration: string | null
          ingredient_type: string
          is_functional: boolean
          name: string
          name_en: string | null
          notes: string | null
          pac_value: number | null
          pod_value: number | null
          process_note: string | null
          purchase_price: number | null
          purchase_qty: number | null
          purchase_unit: string
          reference_basis: string | null
          role_drier: boolean
          role_moistener: boolean
          role_tenderizer: boolean
          role_toughener: boolean
          scaling_exponent: number
          scaling_mode: string
          sugar_type: string | null
          supplier: string | null
          taste_astringent: number | null
          taste_bitter: number | null
          taste_fat: number | null
          taste_salty: number | null
          taste_sour: number | null
          taste_sweet: number | null
          taste_umami: number | null
          typical_rate_max: number | null
          typical_rate_min: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aroma_notes?: string[] | null
          bloom?: number | null
          brand?: string | null
          category_id?: string | null
          comp_alcohol?: number | null
          comp_fat?: number | null
          comp_other_solids?: number | null
          comp_protein?: number | null
          comp_sugar?: number | null
          comp_water?: number | null
          composition_source?: string | null
          created_at?: string
          default_unit?: string
          fat_type?: string | null
          flavour_family_id?: string | null
          flavour_intensity?: number | null
          flavour_note?: string | null
          id?: string
          ingredient_declaration?: string | null
          ingredient_type?: string
          is_functional?: boolean
          name: string
          name_en?: string | null
          notes?: string | null
          pac_value?: number | null
          pod_value?: number | null
          process_note?: string | null
          purchase_price?: number | null
          purchase_qty?: number | null
          purchase_unit?: string
          reference_basis?: string | null
          role_drier?: boolean
          role_moistener?: boolean
          role_tenderizer?: boolean
          role_toughener?: boolean
          scaling_exponent?: number
          scaling_mode?: string
          sugar_type?: string | null
          supplier?: string | null
          taste_astringent?: number | null
          taste_bitter?: number | null
          taste_fat?: number | null
          taste_salty?: number | null
          taste_sour?: number | null
          taste_sweet?: number | null
          taste_umami?: number | null
          typical_rate_max?: number | null
          typical_rate_min?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aroma_notes?: string[] | null
          bloom?: number | null
          brand?: string | null
          category_id?: string | null
          comp_alcohol?: number | null
          comp_fat?: number | null
          comp_other_solids?: number | null
          comp_protein?: number | null
          comp_sugar?: number | null
          comp_water?: number | null
          composition_source?: string | null
          created_at?: string
          default_unit?: string
          fat_type?: string | null
          flavour_family_id?: string | null
          flavour_intensity?: number | null
          flavour_note?: string | null
          id?: string
          ingredient_declaration?: string | null
          ingredient_type?: string
          is_functional?: boolean
          name?: string
          name_en?: string | null
          notes?: string | null
          pac_value?: number | null
          pod_value?: number | null
          process_note?: string | null
          purchase_price?: number | null
          purchase_qty?: number | null
          purchase_unit?: string
          reference_basis?: string | null
          role_drier?: boolean
          role_moistener?: boolean
          role_tenderizer?: boolean
          role_toughener?: boolean
          scaling_exponent?: number
          scaling_mode?: string
          sugar_type?: string | null
          supplier?: string | null
          taste_astringent?: number | null
          taste_bitter?: number | null
          taste_fat?: number | null
          taste_salty?: number | null
          taste_sour?: number | null
          taste_sweet?: number | null
          taste_umami?: number | null
          typical_rate_max?: number | null
          typical_rate_min?: number | null
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
          {
            foreignKeyName: "ingredients_flavour_family_id_fkey"
            columns: ["flavour_family_id"]
            isOneToOne: false
            referencedRelation: "flavour_families"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_entries: {
        Row: {
          body: string
          component_id: string | null
          created_at: string
          id: string
          ingredient_id: string | null
          product_id: string | null
          technique_category_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          component_id?: string | null
          created_at?: string
          id?: string
          ingredient_id?: string | null
          product_id?: string | null
          technique_category_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          component_id?: string | null
          created_at?: string
          id?: string
          ingredient_id?: string | null
          product_id?: string | null
          technique_category_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_entries_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_entries_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_entries_technique_category_id_fkey"
            columns: ["technique_category_id"]
            isOneToOne: false
            referencedRelation: "technique_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      methods: {
        Row: {
          created_at: string
          id: string
          name: string
          name_en: string | null
          notes: string | null
          sort_order: number
          technique_category_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          name_en?: string | null
          notes?: string | null
          sort_order?: number
          technique_category_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          name_en?: string | null
          notes?: string | null
          sort_order?: number
          technique_category_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "methods_technique_category_id_fkey"
            columns: ["technique_category_id"]
            isOneToOne: false
            referencedRelation: "technique_categories"
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
          reference_weight_g: number | null
          shape_size: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          reference_weight_g?: number | null
          shape_size?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          reference_weight_g?: number | null
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
      pilot_settings: {
        Row: {
          monthly_overhead: number
          monthly_unit_count: number
          product_page_section_order: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          monthly_overhead?: number
          monthly_unit_count?: number
          product_page_section_order?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          monthly_overhead?: number
          monthly_unit_count?: number
          product_page_section_order?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      process_categories: {
        Row: {
          color: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      process_event_parameters: {
        Row: {
          created_at: string
          definition_id: string
          id: string
          process_event_id: string
          user_id: string
          value_boolean: boolean | null
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          definition_id: string
          id?: string
          process_event_id: string
          user_id: string
          value_boolean?: boolean | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          definition_id?: string
          id?: string
          process_event_id?: string
          user_id?: string
          value_boolean?: boolean | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_event_parameters_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "process_parameter_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_event_parameters_process_event_id_fkey"
            columns: ["process_event_id"]
            isOneToOne: false
            referencedRelation: "process_events"
            referencedColumns: ["id"]
          },
        ]
      }
      process_events: {
        Row: {
          action: string
          category_id: string | null
          confidence: number | null
          created_at: string
          ended_at: string | null
          event_type: Database["public"]["Enums"]["process_event_type"]
          experiment_id: string
          id: string
          note: string | null
          source: string
          started_at: string
          transcript: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          category_id?: string | null
          confidence?: number | null
          created_at?: string
          ended_at?: string | null
          event_type?: Database["public"]["Enums"]["process_event_type"]
          experiment_id: string
          id?: string
          note?: string | null
          source?: string
          started_at?: string
          transcript?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          category_id?: string | null
          confidence?: number | null
          created_at?: string
          ended_at?: string | null
          event_type?: Database["public"]["Enums"]["process_event_type"]
          experiment_id?: string
          id?: string
          note?: string | null
          source?: string
          started_at?: string
          transcript?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_events_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "process_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_events_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      process_parameter_definitions: {
        Row: {
          created_at: string
          id: string
          key: string
          label: string
          label_en: string | null
          process_category_id: string | null
          sort_order: number
          unit: string | null
          updated_at: string
          user_id: string
          value_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          label: string
          label_en?: string | null
          process_category_id?: string | null
          sort_order?: number
          unit?: string | null
          updated_at?: string
          user_id: string
          value_type: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          label?: string
          label_en?: string | null
          process_category_id?: string | null
          sort_order?: number
          unit?: string | null
          updated_at?: string
          user_id?: string
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_parameter_definitions_process_category_id_fkey"
            columns: ["process_category_id"]
            isOneToOne: false
            referencedRelation: "process_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_allergen_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_allergen_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_allergen_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_components: {
        Row: {
          component_id: string | null
          created_at: string
          formula_version_id: string | null
          id: string
          ingredient_id: string | null
          product_id: string
          product_size_id: string | null
          quantity_g: number | null
          sort_order: number
          user_id: string
        }
        Insert: {
          component_id?: string | null
          created_at?: string
          formula_version_id?: string | null
          id?: string
          ingredient_id?: string | null
          product_id: string
          product_size_id?: string | null
          quantity_g?: number | null
          sort_order?: number
          user_id: string
        }
        Update: {
          component_id?: string | null
          created_at?: string
          formula_version_id?: string | null
          id?: string
          ingredient_id?: string | null
          product_id?: string
          product_size_id?: string | null
          quantity_g?: number | null
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
            foreignKeyName: "product_components_formula_version_id_fkey"
            columns: ["formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_product_size_id_fkey"
            columns: ["product_size_id"]
            isOneToOne: false
            referencedRelation: "product_sizes"
            referencedColumns: ["id"]
          },
        ]
      }
      product_cost_items: {
        Row: {
          cost_item_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          user_id: string
        }
        Insert: {
          cost_item_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          user_id?: string
        }
        Update: {
          cost_item_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_cost_items_cost_item_id_fkey"
            columns: ["cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_cost_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_preferred_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_preferred_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_preferred_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sizes: {
        Row: {
          created_at: string
          diameter_mm: number | null
          height_mm: number | null
          id: string
          is_default: boolean
          length_mm: number | null
          monthly_unit_count: number | null
          notes: string | null
          product_id: string
          selling_price: number | null
          shape: string
          updated_at: string
          user_id: string
          width_mm: number | null
        }
        Insert: {
          created_at?: string
          diameter_mm?: number | null
          height_mm?: number | null
          id?: string
          is_default?: boolean
          length_mm?: number | null
          monthly_unit_count?: number | null
          notes?: string | null
          product_id: string
          selling_price?: number | null
          shape: string
          updated_at?: string
          user_id: string
          width_mm?: number | null
        }
        Update: {
          created_at?: string
          diameter_mm?: number | null
          height_mm?: number | null
          id?: string
          is_default?: boolean
          length_mm?: number | null
          monthly_unit_count?: number | null
          notes?: string | null
          product_id?: string
          selling_price?: number | null
          shape?: string
          updated_at?: string
          user_id?: string
          width_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_sizes_product_id_fkey"
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
          allergy_notes: string | null
          category_id: string | null
          created_at: string
          description: string | null
          has_allergies: boolean
          id: string
          image_actual_url: string | null
          image_cross_section_actual_url: string | null
          image_cross_section_layout_url: string | null
          image_imagination_url: string | null
          name: string
          notes: string | null
          pinned: boolean
          product_target: Json
          status: Database["public"]["Enums"]["product_status"]
          target_customer_notes: string | null
          technique_category_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allergy_notes?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          has_allergies?: boolean
          id?: string
          image_actual_url?: string | null
          image_cross_section_actual_url?: string | null
          image_cross_section_layout_url?: string | null
          image_imagination_url?: string | null
          name: string
          notes?: string | null
          pinned?: boolean
          product_target?: Json
          status?: Database["public"]["Enums"]["product_status"]
          target_customer_notes?: string | null
          technique_category_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allergy_notes?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          has_allergies?: boolean
          id?: string
          image_actual_url?: string | null
          image_cross_section_actual_url?: string | null
          image_cross_section_layout_url?: string | null
          image_imagination_url?: string | null
          name?: string
          notes?: string | null
          pinned?: boolean
          product_target?: Json
          status?: Database["public"]["Enums"]["product_status"]
          target_customer_notes?: string | null
          technique_category_id?: string | null
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
          {
            foreignKeyName: "products_technique_category_id_fkey"
            columns: ["technique_category_id"]
            isOneToOne: false
            referencedRelation: "technique_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_entries: {
        Row: {
          author: string | null
          component_id: string | null
          created_at: string
          id: string
          ingredient_id: string | null
          note: string
          product_id: string | null
          source_type: string
          technique_category_id: string | null
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          author?: string | null
          component_id?: string | null
          created_at?: string
          id?: string
          ingredient_id?: string | null
          note?: string
          product_id?: string | null
          source_type?: string
          technique_category_id?: string | null
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          author?: string | null
          component_id?: string | null
          created_at?: string
          id?: string
          ingredient_id?: string | null
          note?: string
          product_id?: string | null
          source_type?: string
          technique_category_id?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_entries_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_entries_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_entries_technique_category_id_fkey"
            columns: ["technique_category_id"]
            isOneToOne: false
            referencedRelation: "technique_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      sensory_attributes: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          name_en: string | null
          scale_max: number
          scale_min: number
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          name: string
          name_en?: string | null
          scale_max?: number
          scale_min?: number
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          name_en?: string | null
          scale_max?: number
          scale_min?: number
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_items: {
        Row: {
          component_id: string | null
          created_at: string
          id: string
          item_type: string
          notes: string | null
          product_size_id: string | null
          quantity: number
          unit_label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          component_id?: string | null
          created_at?: string
          id?: string
          item_type: string
          notes?: string | null
          product_size_id?: string | null
          quantity?: number
          unit_label?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          component_id?: string | null
          created_at?: string
          id?: string
          item_type?: string
          notes?: string | null
          product_size_id?: string | null
          quantity?: number
          unit_label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_product_size_id_fkey"
            columns: ["product_size_id"]
            isOneToOne: false
            referencedRelation: "product_sizes"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          note: string | null
          quantity_delta: number
          reason: string
          stock_item_id: string
          user_id: string
          work_session_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          quantity_delta: number
          reason: string
          stock_item_id: string
          user_id?: string
          work_session_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          quantity_delta?: number
          reason?: string
          stock_item_id?: string
          user_id?: string
          work_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_work_session_id_fkey"
            columns: ["work_session_id"]
            isOneToOne: false
            referencedRelation: "work_sessions"
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
      task_type_colors: {
        Row: {
          color_class: string
          created_at: string
          id: string
          task_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color_class: string
          created_at?: string
          id?: string
          task_type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          color_class?: string
          created_at?: string
          id?: string
          task_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      technique_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          name_en: string | null
          notes: string | null
          parent_id: string | null
          sort_order: number
          suggested_base_formula: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          name_en?: string | null
          notes?: string | null
          parent_id?: string | null
          sort_order?: number
          suggested_base_formula?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          name_en?: string | null
          notes?: string | null
          parent_id?: string | null
          sort_order?: number
          suggested_base_formula?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technique_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "technique_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      work_session_formula_versions: {
        Row: {
          added_at: string
          base_weight_id: string | null
          base_weight_qty: number | null
          formula_version_id: string
          id: string
          mould_id: string | null
          mould_qty: number | null
          multiplier: number
          sort_order: number
          updated_at: string
          user_id: string
          work_session_id: string
        }
        Insert: {
          added_at?: string
          base_weight_id?: string | null
          base_weight_qty?: number | null
          formula_version_id: string
          id?: string
          mould_id?: string | null
          mould_qty?: number | null
          multiplier?: number
          sort_order?: number
          updated_at?: string
          user_id: string
          work_session_id: string
        }
        Update: {
          added_at?: string
          base_weight_id?: string | null
          base_weight_qty?: number | null
          formula_version_id?: string
          id?: string
          mould_id?: string | null
          mould_qty?: number | null
          multiplier?: number
          sort_order?: number
          updated_at?: string
          user_id?: string
          work_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_session_formula_versions_base_weight_id_fkey"
            columns: ["base_weight_id"]
            isOneToOne: false
            referencedRelation: "base_weight_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_session_formula_versions_formula_version_id_fkey"
            columns: ["formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_session_formula_versions_mould_id_fkey"
            columns: ["mould_id"]
            isOneToOne: false
            referencedRelation: "moulds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_session_formula_versions_work_session_id_fkey"
            columns: ["work_session_id"]
            isOneToOne: false
            referencedRelation: "work_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_session_multiplier_history: {
        Row: {
          applied_at: string
          applied_multiplier: number
          formula_version_id: string
          id: string
          previous_multiplier: number
          resulting_working_quantity_snapshot: Json | null
          user_id: string
          work_session_id: string
        }
        Insert: {
          applied_at?: string
          applied_multiplier: number
          formula_version_id: string
          id?: string
          previous_multiplier: number
          resulting_working_quantity_snapshot?: Json | null
          user_id: string
          work_session_id: string
        }
        Update: {
          applied_at?: string
          applied_multiplier?: number
          formula_version_id?: string
          id?: string
          previous_multiplier?: number
          resulting_working_quantity_snapshot?: Json | null
          user_id?: string
          work_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_session_multiplier_history_formula_version_id_fkey"
            columns: ["formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_session_multiplier_history_work_session_id_fkey"
            columns: ["work_session_id"]
            isOneToOne: false
            referencedRelation: "work_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_session_progress: {
        Row: {
          formula_version_ingredient_id: string
          id: string
          note: string | null
          status: string
          updated_at: string
          user_id: string
          work_session_id: string
        }
        Insert: {
          formula_version_ingredient_id: string
          id?: string
          note?: string | null
          status?: string
          updated_at?: string
          user_id: string
          work_session_id: string
        }
        Update: {
          formula_version_ingredient_id?: string
          id?: string
          note?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          work_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_session_progress_formula_version_ingredient_id_fkey"
            columns: ["formula_version_ingredient_id"]
            isOneToOne: false
            referencedRelation: "formula_version_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_session_progress_work_session_id_fkey"
            columns: ["work_session_id"]
            isOneToOne: false
            referencedRelation: "work_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_session_task_ingredients: {
        Row: {
          created_at: string
          formula_version_ingredient_id: string
          id: string
          task_id: string
          user_id: string
          work_session_id: string
        }
        Insert: {
          created_at?: string
          formula_version_ingredient_id: string
          id?: string
          task_id: string
          user_id?: string
          work_session_id: string
        }
        Update: {
          created_at?: string
          formula_version_ingredient_id?: string
          id?: string
          task_id?: string
          user_id?: string
          work_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_session_task_ingredients_formula_version_ingredient_i_fkey"
            columns: ["formula_version_ingredient_id"]
            isOneToOne: false
            referencedRelation: "formula_version_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_session_task_ingredients_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "work_session_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_session_task_ingredients_work_session_id_fkey"
            columns: ["work_session_id"]
            isOneToOne: false
            referencedRelation: "work_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_session_task_predecessors: {
        Row: {
          created_at: string
          id: string
          predecessor_task_id: string
          task_id: string
          user_id: string
          work_session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          predecessor_task_id: string
          task_id: string
          user_id?: string
          work_session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          predecessor_task_id?: string
          task_id?: string
          user_id?: string
          work_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_session_task_predecessors_predecessor_task_id_fkey"
            columns: ["predecessor_task_id"]
            isOneToOne: false
            referencedRelation: "work_session_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_session_task_predecessors_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "work_session_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_session_task_predecessors_work_session_id_fkey"
            columns: ["work_session_id"]
            isOneToOne: false
            referencedRelation: "work_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_session_tasks: {
        Row: {
          actual_started_at: string | null
          checklist_items: Json | null
          completed_at: string | null
          created_at: string
          formula_version_id: string | null
          id: string
          is_optional: boolean
          note: string | null
          observation_height_end_mm: number | null
          observation_height_mid_mm: number | null
          observation_height_start_mm: number | null
          observation_status: string | null
          observation_temperature_c: number | null
          planned_end_at: string | null
          planned_start_at: string | null
          predecessor_task_id: string | null
          sort_order: number
          status: string
          task_name: string
          task_type: string | null
          timer_minutes: number | null
          updated_at: string
          user_id: string
          work_session_id: string
        }
        Insert: {
          actual_started_at?: string | null
          checklist_items?: Json | null
          completed_at?: string | null
          created_at?: string
          formula_version_id?: string | null
          id?: string
          is_optional?: boolean
          note?: string | null
          observation_height_end_mm?: number | null
          observation_height_mid_mm?: number | null
          observation_height_start_mm?: number | null
          observation_status?: string | null
          observation_temperature_c?: number | null
          planned_end_at?: string | null
          planned_start_at?: string | null
          predecessor_task_id?: string | null
          sort_order?: number
          status?: string
          task_name: string
          task_type?: string | null
          timer_minutes?: number | null
          updated_at?: string
          user_id: string
          work_session_id: string
        }
        Update: {
          actual_started_at?: string | null
          checklist_items?: Json | null
          completed_at?: string | null
          created_at?: string
          formula_version_id?: string | null
          id?: string
          is_optional?: boolean
          note?: string | null
          observation_height_end_mm?: number | null
          observation_height_mid_mm?: number | null
          observation_height_start_mm?: number | null
          observation_status?: string | null
          observation_temperature_c?: number | null
          planned_end_at?: string | null
          planned_start_at?: string | null
          predecessor_task_id?: string | null
          sort_order?: number
          status?: string
          task_name?: string
          task_type?: string | null
          timer_minutes?: number | null
          updated_at?: string
          user_id?: string
          work_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_session_tasks_formula_version_id_fkey"
            columns: ["formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_session_tasks_predecessor_task_id_fkey"
            columns: ["predecessor_task_id"]
            isOneToOne: false
            referencedRelation: "work_session_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_session_tasks_work_session_id_fkey"
            columns: ["work_session_id"]
            isOneToOne: false
            referencedRelation: "work_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workflow_template_task_predecessors: {
        Row: {
          id: string
          predecessor_task_id: string
          task_id: string
          template_id: string
          user_id: string
        }
        Insert: {
          id?: string
          predecessor_task_id: string
          task_id: string
          template_id: string
          user_id?: string
        }
        Update: {
          id?: string
          predecessor_task_id?: string
          task_id?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_template_task_predecessors_predecessor_task_id_fkey"
            columns: ["predecessor_task_id"]
            isOneToOne: false
            referencedRelation: "workflow_template_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_task_predecessors_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "workflow_template_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_task_predecessors_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_template_tasks: {
        Row: {
          checklist_items: string[] | null
          created_at: string
          id: string
          is_optional: boolean
          sort_order: number
          task_name: string
          task_type: string | null
          template_id: string
          timer_minutes: number | null
          user_id: string
        }
        Insert: {
          checklist_items?: string[] | null
          created_at?: string
          id?: string
          is_optional?: boolean
          sort_order?: number
          task_name: string
          task_type?: string | null
          template_id: string
          timer_minutes?: number | null
          user_id?: string
        }
        Update: {
          checklist_items?: string[] | null
          created_at?: string
          id?: string
          is_optional?: boolean
          sort_order?: number
          task_name?: string
          task_type?: string | null
          template_id?: string
          timer_minutes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          technique_category_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          technique_category_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          technique_category_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_templates_technique_category_id_fkey"
            columns: ["technique_category_id"]
            isOneToOne: false
            referencedRelation: "technique_categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      seed_default_ingredients: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      seed_flavour_families: { Args: { p_user_id: string }; Returns: undefined }
      seed_process_parameter_definitions: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      seed_technique_categories: {
        Args: { p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      development_outcome: "KEEP" | "FAILED" | "PARTIAL" | "REFERENCE"
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
        | "LOGGED"
      process_event_type: "point" | "span"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      development_outcome: ["KEEP", "FAILED", "PARTIAL", "REFERENCE"],
      experiment_status: [
        "PLANNED",
        "RUNNING",
        "COMPLETE",
        "FAILED",
        "CANCELLED",
      ],
      formula_status: [
        "DRAFT",
        "TESTING",
        "CURRENT",
        "SUPERSEDED",
        "ARCHIVED",
        "LOGGED",
      ],
      process_event_type: ["point", "span"],
      product_status: ["IDEA", "ACTIVE", "TESTING", "STABLE", "ARCHIVED"],
    },
  },
} as const
