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
          created_at: string
          description: string | null
          id: string
          name: string
          notes: string | null
          technique_category_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          notes?: string | null
          technique_category_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          notes?: string | null
          technique_category_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "components_technique_category_id_fkey"
            columns: ["technique_category_id"]
            isOneToOne: false
            referencedRelation: "technique_categories"
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
      formula_version_ingredients: {
        Row: {
          amount: number
          amount_source: string
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
          amount_source?: string
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
          amount_source?: string
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
          basis_overrides: Json
          bath_water_g: number | null
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
          basis_overrides?: Json
          bath_water_g?: number | null
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
          basis_overrides?: Json
          bath_water_g?: number | null
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
          is_functional: boolean
          name: string
          name_en: string | null
          notes: string | null
          pac_value: number | null
          pod_value: number | null
          process_note: string | null
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
          is_functional?: boolean
          name: string
          name_en?: string | null
          notes?: string | null
          pac_value?: number | null
          pod_value?: number | null
          process_note?: string | null
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
          is_functional?: boolean
          name?: string
          name_en?: string | null
          notes?: string | null
          pac_value?: number | null
          pod_value?: number | null
          process_note?: string | null
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
      seed_technique_categories: {
        Args: { p_user_id: string }
        Returns: undefined
      }
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
      process_event_type: ["point", "span"],
      product_status: ["IDEA", "ACTIVE", "TESTING", "STABLE", "ARCHIVED"],
    },
  },
} as const
