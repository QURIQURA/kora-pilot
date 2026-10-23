export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      _ddl_probe: {
        Row: {
          id: number | null;
        };
        Insert: {
          id?: number | null;
        };
        Update: {
          id?: number | null;
        };
        Relationships: [];
      };
      _sync_debug_log: {
        Row: {
          created_at: string | null;
          detail: string | null;
          id: number;
          step: string | null;
        };
        Insert: {
          created_at?: string | null;
          detail?: string | null;
          id?: number;
          step?: string | null;
        };
        Update: {
          created_at?: string | null;
          detail?: string | null;
          id?: number;
          step?: string | null;
        };
        Relationships: [];
      };
      base_weight_presets: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          updated_at: string;
          user_id: string;
          weight_g: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          updated_at?: string;
          user_id: string;
          weight_g: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          updated_at?: string;
          user_id?: string;
          weight_g?: number;
        };
        Relationships: [];
      };
      cake_sizes: {
        Row: {
          cream_g: number | null;
          created_at: string;
          diameter_mm: number | null;
          height_mm: number | null;
          id: string;
          length_mm: number | null;
          name: string;
          notes: string | null;
          servings: number | null;
          shape: string | null;
          size_inch: number | null;
          sheet_mould_id: string | null;
          sort_order: number;
          updated_at: string;
          user_id: string;
          width_mm: number | null;
        };
        Insert: {
          cream_g?: number | null;
          created_at?: string;
          diameter_mm?: number | null;
          height_mm?: number | null;
          id?: string;
          length_mm?: number | null;
          name: string;
          notes?: string | null;
          servings?: number | null;
          shape?: string | null;
          size_inch?: number | null;
          sheet_mould_id?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
          width_mm?: number | null;
        };
        Update: {
          cream_g?: number | null;
          created_at?: string;
          diameter_mm?: number | null;
          height_mm?: number | null;
          id?: string;
          length_mm?: number | null;
          name?: string;
          notes?: string | null;
          servings?: number | null;
          shape?: string | null;
          size_inch?: number | null;
          sheet_mould_id?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
          width_mm?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "cake_sizes_sheet_mould_id_fkey";
            columns: ["sheet_mould_id"];
            isOneToOne: false;
            referencedRelation: "moulds";
            referencedColumns: ["id"];
          },
        ];
      };
      capacities: {
        Row: {
          created_at: string;
          diameter_mm: number | null;
          height_mm: number | null;
          id: string;
          kind: string;
          name: string;
          notes: string | null;
          shape_size: string | null;
          updated_at: string;
          user_id: string;
          weight_g: number | null;
        };
        Insert: {
          created_at?: string;
          diameter_mm?: number | null;
          height_mm?: number | null;
          id?: string;
          kind: string;
          name: string;
          notes?: string | null;
          shape_size?: string | null;
          updated_at?: string;
          user_id: string;
          weight_g?: number | null;
        };
        Update: {
          created_at?: string;
          diameter_mm?: number | null;
          height_mm?: number | null;
          id?: string;
          kind?: string;
          name?: string;
          notes?: string | null;
          shape_size?: string | null;
          updated_at?: string;
          user_id?: string;
          weight_g?: number | null;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          name: string;
          parent_id: string | null;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          name: string;
          parent_id?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
          parent_id?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      component_cost_items: {
        Row: {
          component_id: string;
          cost_item_id: string;
          created_at: string;
          id: string;
          quantity: number;
          user_id: string;
        };
        Insert: {
          component_id: string;
          cost_item_id: string;
          created_at?: string;
          id?: string;
          quantity?: number;
          user_id?: string;
        };
        Update: {
          component_id?: string;
          cost_item_id?: string;
          created_at?: string;
          id?: string;
          quantity?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "component_cost_items_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "components";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "component_cost_items_cost_item_id_fkey";
            columns: ["cost_item_id"];
            isOneToOne: false;
            referencedRelation: "cost_items";
            referencedColumns: ["id"];
          },
        ];
      };
      components: {
        Row: {
          auto_apply_default_workflow: boolean;
          created_at: string;
          default_workflow_template_id: string | null;
          description: string | null;
          id: string;
          name: string;
          notes: string | null;
          pinned: boolean;
          scaling_mode: string;
          technique_category_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          auto_apply_default_workflow?: boolean;
          created_at?: string;
          default_workflow_template_id?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          pinned?: boolean;
          scaling_mode: string;
          technique_category_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          auto_apply_default_workflow?: boolean;
          created_at?: string;
          default_workflow_template_id?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          pinned?: boolean;
          scaling_mode?: string;
          technique_category_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "components_default_workflow_template_id_fkey";
            columns: ["default_workflow_template_id"];
            isOneToOne: false;
            referencedRelation: "workflow_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "components_technique_category_id_fkey";
            columns: ["technique_category_id"];
            isOneToOne: false;
            referencedRelation: "technique_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      cost_item_history: {
        Row: {
          changed_at: string;
          cost_item_id: string;
          id: string;
          new_cost: number;
          note: string | null;
          previous_cost: number | null;
          user_id: string;
        };
        Insert: {
          changed_at?: string;
          cost_item_id: string;
          id?: string;
          new_cost: number;
          note?: string | null;
          previous_cost?: number | null;
          user_id?: string;
        };
        Update: {
          changed_at?: string;
          cost_item_id?: string;
          id?: string;
          new_cost?: number;
          note?: string | null;
          previous_cost?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cost_item_history_cost_item_id_fkey";
            columns: ["cost_item_id"];
            isOneToOne: false;
            referencedRelation: "cost_items";
            referencedColumns: ["id"];
          },
        ];
      };
      cost_items: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          unit_cost: number;
          unit_label: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          unit_cost?: number;
          unit_label?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          unit_cost?: number;
          unit_label?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          instagram_handle: string | null;
          name: string | null;
          notes: string | null;
          phone: string | null;
          pinned: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          instagram_handle?: string | null;
          name?: string | null;
          notes?: string | null;
          phone?: string | null;
          pinned?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          instagram_handle?: string | null;
          name?: string | null;
          notes?: string | null;
          phone?: string | null;
          pinned?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      daily_task_templates: {
        Row: {
          checklist_items: string[];
          created_at: string;
          default_minutes: number;
          id: string;
          name: string;
          note: string | null;
          sort_order: number;
          task_type: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          checklist_items?: string[];
          created_at?: string;
          default_minutes?: number;
          id?: string;
          name: string;
          note?: string | null;
          sort_order?: number;
          task_type?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          checklist_items?: string[];
          created_at?: string;
          default_minutes?: number;
          id?: string;
          name?: string;
          note?: string | null;
          sort_order?: number;
          task_type?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      daily_tasks: {
        Row: {
          created_at: string;
          end_time: string;
          id: string;
          name: string;
          note: string | null;
          order_id: string | null;
          planner_task_id: string | null;
          start_time: string;
          task_date: string;
          task_type: string | null;
          template_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          end_time: string;
          id?: string;
          name: string;
          note?: string | null;
          order_id?: string | null;
          planner_task_id?: string | null;
          start_time: string;
          task_date: string;
          task_type?: string | null;
          template_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          end_time?: string;
          id?: string;
          name?: string;
          note?: string | null;
          order_id?: string | null;
          planner_task_id?: string | null;
          start_time?: string;
          task_date?: string;
          task_type?: string | null;
          template_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_tasks_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_tasks_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "daily_task_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      dietary_build_items: {
        Row: {
          build_id: string;
          component_id: string;
          formula_version_id: string;
          id: string;
          sort_order: number;
          user_id: string;
        };
        Insert: {
          build_id: string;
          component_id: string;
          formula_version_id: string;
          id?: string;
          sort_order?: number;
          user_id?: string;
        };
        Update: {
          build_id?: string;
          component_id?: string;
          formula_version_id?: string;
          id?: string;
          sort_order?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dietary_build_items_build_id_fkey";
            columns: ["build_id"];
            isOneToOne: false;
            referencedRelation: "dietary_builds";
            referencedColumns: ["id"];
          },
        ];
      };
      dietary_build_tags: {
        Row: {
          build_id: string;
          dietary_tag_id: string;
          id: string;
          user_id: string;
        };
        Insert: {
          build_id: string;
          dietary_tag_id: string;
          id?: string;
          user_id?: string;
        };
        Update: {
          build_id?: string;
          dietary_tag_id?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dietary_build_tags_build_id_fkey";
            columns: ["build_id"];
            isOneToOne: false;
            referencedRelation: "dietary_builds";
            referencedColumns: ["id"];
          },
        ];
      };
      dietary_builds: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          product_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          product_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          product_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      dietary_tags: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      order_dietary_tags: {
        Row: {
          created_at: string;
          dietary_tag_id: string;
          id: string;
          order_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          dietary_tag_id: string;
          id?: string;
          order_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          dietary_tag_id?: string;
          id?: string;
          order_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_dietary_tags_dietary_tag_id_fkey";
            columns: ["dietary_tag_id"];
            isOneToOne: false;
            referencedRelation: "dietary_tags";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_dietary_tags_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      flavour_families: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          name: string;
          name_en: string | null;
          notes: string | null;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          name: string;
          name_en?: string | null;
          notes?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
          name_en?: string | null;
          notes?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      formula_version_dietary_tags: {
        Row: {
          created_at: string;
          dietary_tag_id: string;
          formula_version_id: string;
          id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          dietary_tag_id: string;
          formula_version_id: string;
          id?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          dietary_tag_id?: string;
          formula_version_id?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "formula_version_dietary_tags_dietary_tag_id_fkey";
            columns: ["dietary_tag_id"];
            isOneToOne: false;
            referencedRelation: "dietary_tags";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "formula_version_dietary_tags_formula_version_id_fkey";
            columns: ["formula_version_id"];
            isOneToOne: false;
            referencedRelation: "formula_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      formula_version_batches: {
        Row: {
          created_at: string;
          formula_version_id: string;
          id: string;
          label: string | null;
          mould_count: number | null;
          mould_id: string | null;
          multiplier: number;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          formula_version_id: string;
          id?: string;
          label?: string | null;
          mould_count?: number | null;
          mould_id?: string | null;
          multiplier?: number;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          formula_version_id?: string;
          id?: string;
          label?: string | null;
          mould_count?: number | null;
          mould_id?: string | null;
          multiplier?: number;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "formula_version_batches_formula_version_id_fkey";
            columns: ["formula_version_id"];
            isOneToOne: false;
            referencedRelation: "formula_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "formula_version_batches_mould_id_fkey";
            columns: ["mould_id"];
            isOneToOne: false;
            referencedRelation: "moulds";
            referencedColumns: ["id"];
          },
        ];
      };
      formula_version_ingredients: {
        Row: {
          amount: number;
          amount_source: string;
          created_at: string;
          formula_version_id: string;
          id: string;
          ingredient_id: string;
          note: string | null;
          secondary_amount: number | null;
          secondary_unit: string | null;
          sort_order: number;
          unit: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount?: number;
          amount_source?: string;
          created_at?: string;
          formula_version_id: string;
          id?: string;
          ingredient_id: string;
          note?: string | null;
          secondary_amount?: number | null;
          secondary_unit?: string | null;
          sort_order?: number;
          unit?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          amount_source?: string;
          created_at?: string;
          formula_version_id?: string;
          id?: string;
          ingredient_id?: string;
          note?: string | null;
          secondary_amount?: number | null;
          secondary_unit?: string | null;
          sort_order?: number;
          unit?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "formula_version_ingredients_formula_version_id_fkey";
            columns: ["formula_version_id"];
            isOneToOne: false;
            referencedRelation: "formula_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "formula_version_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
      };
      formula_versions: {
        Row: {
          basis_overrides: Json;
          bath_water_g: number | null;
          change_reason: string | null;
          change_summary: string | null;
          created_at: string;
          default_base_weight_id: string | null;
          default_capacity_id: string | null;
          default_mould_id: string | null;
          formula_id: string;
          id: string;
          notes: string | null;
          status: Database["public"]["Enums"]["formula_status"];
          updated_at: string;
          user_id: string;
          version_number: number;
          yield_quantity: number | null;
        };
        Insert: {
          basis_overrides?: Json;
          bath_water_g?: number | null;
          change_reason?: string | null;
          change_summary?: string | null;
          created_at?: string;
          default_base_weight_id?: string | null;
          default_capacity_id?: string | null;
          default_mould_id?: string | null;
          formula_id: string;
          id?: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["formula_status"];
          updated_at?: string;
          user_id: string;
          version_number?: number;
          yield_quantity?: number | null;
        };
        Update: {
          basis_overrides?: Json;
          bath_water_g?: number | null;
          change_reason?: string | null;
          change_summary?: string | null;
          created_at?: string;
          default_base_weight_id?: string | null;
          default_capacity_id?: string | null;
          default_mould_id?: string | null;
          formula_id?: string;
          id?: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["formula_status"];
          updated_at?: string;
          user_id?: string;
          version_number?: number;
          yield_quantity?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "formula_versions_default_base_weight_id_fkey";
            columns: ["default_base_weight_id"];
            isOneToOne: false;
            referencedRelation: "base_weight_presets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "formula_versions_default_capacity_id_fkey";
            columns: ["default_capacity_id"];
            isOneToOne: false;
            referencedRelation: "capacities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "formula_versions_default_mould_id_fkey";
            columns: ["default_mould_id"];
            isOneToOne: false;
            referencedRelation: "moulds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "formula_versions_formula_id_fkey";
            columns: ["formula_id"];
            isOneToOne: false;
            referencedRelation: "formulas";
            referencedColumns: ["id"];
          },
        ];
      };
      formulas: {
        Row: {
          component_id: string | null;
          created_at: string;
          derived_from_formula_id: string | null;
          id: string;
          is_base_formula: boolean;
          method_id: string | null;
          name: string;
          notes: string | null;
          technique_category_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          component_id?: string | null;
          created_at?: string;
          derived_from_formula_id?: string | null;
          id?: string;
          is_base_formula?: boolean;
          method_id?: string | null;
          name: string;
          notes?: string | null;
          technique_category_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          component_id?: string | null;
          created_at?: string;
          derived_from_formula_id?: string | null;
          id?: string;
          is_base_formula?: boolean;
          method_id?: string | null;
          name?: string;
          notes?: string | null;
          technique_category_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "formulas_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "components";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "formulas_derived_from_formula_id_fkey";
            columns: ["derived_from_formula_id"];
            isOneToOne: false;
            referencedRelation: "formulas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "formulas_method_id_fkey";
            columns: ["method_id"];
            isOneToOne: false;
            referencedRelation: "methods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "formulas_technique_category_id_fkey";
            columns: ["technique_category_id"];
            isOneToOne: false;
            referencedRelation: "technique_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredient_function_links: {
        Row: {
          created_at: string;
          function_id: string;
          id: string;
          ingredient_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          function_id: string;
          id?: string;
          ingredient_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          function_id?: string;
          id?: string;
          ingredient_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ingredient_function_links_function_id_fkey";
            columns: ["function_id"];
            isOneToOne: false;
            referencedRelation: "ingredient_functions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ingredient_function_links_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredient_functions: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          is_default: boolean;
          key: string | null;
          name: string;
          name_en: string | null;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          key?: string | null;
          name: string;
          name_en?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          key?: string | null;
          name?: string;
          name_en?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ingredient_groups: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          name: string;
          name_en: string | null;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          name: string;
          name_en?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
          name_en?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ingredients: {
        Row: {
          aroma_notes: string[] | null;
          bloom: number | null;
          brand: string | null;
          category_id: string | null;
          comp_alcohol: number | null;
          comp_fat: number | null;
          comp_other_solids: number | null;
          comp_protein: number | null;
          comp_sugar: number | null;
          comp_water: number | null;
          composition_source: string | null;
          created_at: string;
          default_unit: string;
          fat_type: string | null;
          flavour_family_id: string | null;
          flavour_intensity: number | null;
          flavour_note: string | null;
          group_id: string | null;
          id: string;
          ingredient_declaration: string | null;
          ingredient_type: string;
          is_functional: boolean;
          name: string;
          name_en: string | null;
          notes: string | null;
          pac_value: number | null;
          pod_value: number | null;
          process_note: string | null;
          purchase_price: number | null;
          purchase_qty: number | null;
          purchase_unit: string;
          reference_basis: string | null;
          role_drier: boolean;
          role_moistener: boolean;
          role_tenderizer: boolean;
          role_toughener: boolean;
          scaling_exponent: number;
          scaling_mode: string;
          sugar_type: string | null;
          supplier: string | null;
          taste_astringent: number | null;
          taste_bitter: number | null;
          taste_fat: number | null;
          taste_salty: number | null;
          taste_sour: number | null;
          taste_sweet: number | null;
          taste_umami: number | null;
          typical_rate_max: number | null;
          typical_rate_min: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          aroma_notes?: string[] | null;
          bloom?: number | null;
          brand?: string | null;
          category_id?: string | null;
          comp_alcohol?: number | null;
          comp_fat?: number | null;
          comp_other_solids?: number | null;
          comp_protein?: number | null;
          comp_sugar?: number | null;
          comp_water?: number | null;
          composition_source?: string | null;
          created_at?: string;
          default_unit?: string;
          fat_type?: string | null;
          flavour_family_id?: string | null;
          flavour_intensity?: number | null;
          flavour_note?: string | null;
          group_id?: string | null;
          id?: string;
          ingredient_declaration?: string | null;
          ingredient_type?: string;
          is_functional?: boolean;
          name: string;
          name_en?: string | null;
          notes?: string | null;
          pac_value?: number | null;
          pod_value?: number | null;
          process_note?: string | null;
          purchase_price?: number | null;
          purchase_qty?: number | null;
          purchase_unit?: string;
          reference_basis?: string | null;
          role_drier?: boolean;
          role_moistener?: boolean;
          role_tenderizer?: boolean;
          role_toughener?: boolean;
          scaling_exponent?: number;
          scaling_mode?: string;
          sugar_type?: string | null;
          supplier?: string | null;
          taste_astringent?: number | null;
          taste_bitter?: number | null;
          taste_fat?: number | null;
          taste_salty?: number | null;
          taste_sour?: number | null;
          taste_sweet?: number | null;
          taste_umami?: number | null;
          typical_rate_max?: number | null;
          typical_rate_min?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          aroma_notes?: string[] | null;
          bloom?: number | null;
          brand?: string | null;
          category_id?: string | null;
          comp_alcohol?: number | null;
          comp_fat?: number | null;
          comp_other_solids?: number | null;
          comp_protein?: number | null;
          comp_sugar?: number | null;
          comp_water?: number | null;
          composition_source?: string | null;
          created_at?: string;
          default_unit?: string;
          fat_type?: string | null;
          flavour_family_id?: string | null;
          flavour_intensity?: number | null;
          flavour_note?: string | null;
          group_id?: string | null;
          id?: string;
          ingredient_declaration?: string | null;
          ingredient_type?: string;
          is_functional?: boolean;
          name?: string;
          name_en?: string | null;
          notes?: string | null;
          pac_value?: number | null;
          pod_value?: number | null;
          process_note?: string | null;
          purchase_price?: number | null;
          purchase_qty?: number | null;
          purchase_unit?: string;
          reference_basis?: string | null;
          role_drier?: boolean;
          role_moistener?: boolean;
          role_tenderizer?: boolean;
          role_toughener?: boolean;
          scaling_exponent?: number;
          scaling_mode?: string;
          sugar_type?: string | null;
          supplier?: string | null;
          taste_astringent?: number | null;
          taste_bitter?: number | null;
          taste_fat?: number | null;
          taste_salty?: number | null;
          taste_sour?: number | null;
          taste_sweet?: number | null;
          taste_umami?: number | null;
          typical_rate_max?: number | null;
          typical_rate_min?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ingredients_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ingredients_flavour_family_id_fkey";
            columns: ["flavour_family_id"];
            isOneToOne: false;
            referencedRelation: "flavour_families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ingredients_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "ingredient_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_entries: {
        Row: {
          body: string;
          component_id: string | null;
          created_at: string;
          id: string;
          ingredient_id: string | null;
          product_id: string | null;
          technique_category_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body?: string;
          component_id?: string | null;
          created_at?: string;
          id?: string;
          ingredient_id?: string | null;
          product_id?: string | null;
          technique_category_id?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          component_id?: string | null;
          created_at?: string;
          id?: string;
          ingredient_id?: string | null;
          product_id?: string | null;
          technique_category_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_entries_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "components";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "knowledge_entries_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "knowledge_entries_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "knowledge_entries_technique_category_id_fkey";
            columns: ["technique_category_id"];
            isOneToOne: false;
            referencedRelation: "technique_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      methods: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          name_en: string | null;
          notes: string | null;
          sort_order: number;
          technique_category_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          name_en?: string | null;
          notes?: string | null;
          sort_order?: number;
          technique_category_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          name_en?: string | null;
          notes?: string | null;
          sort_order?: number;
          technique_category_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "methods_technique_category_id_fkey";
            columns: ["technique_category_id"];
            isOneToOne: false;
            referencedRelation: "technique_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      moulds: {
        Row: {
          created_at: string;
          diameter_mm: number | null;
          height_mm: number | null;
          length_mm: number | null;
          width_mm: number | null;
          id: string;
          name: string;
          notes: string | null;
          reference_weight_g: number | null;
          shape_size: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          diameter_mm?: number | null;
          height_mm?: number | null;
          length_mm?: number | null;
          width_mm?: number | null;
          id?: string;
          name: string;
          notes?: string | null;
          reference_weight_g?: number | null;
          shape_size?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          diameter_mm?: number | null;
          height_mm?: number | null;
          length_mm?: number | null;
          width_mm?: number | null;
          id?: string;
          name?: string;
          notes?: string | null;
          reference_weight_g?: number | null;
          shape_size?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      order_allergen_ingredients: {
        Row: {
          created_at: string;
          id: string;
          ingredient_id: string;
          order_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          ingredient_id: string;
          order_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          ingredient_id?: string;
          order_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_allergen_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_allergen_ingredients_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_moodboard_items: {
        Row: {
          color: string | null;
          color2: string | null;
          content: string | null;
          created_at: string;
          height: number;
          id: string;
          image_url: string | null;
          kind: string;
          order_id: string;
          pattern: string;
          rotation: number;
          shape: string;
          updated_at: string;
          user_id: string;
          width: number;
          x: number;
          y: number;
          z_index: number;
        };
        Insert: {
          color?: string | null;
          color2?: string | null;
          content?: string | null;
          created_at?: string;
          height?: number;
          id?: string;
          image_url?: string | null;
          kind?: string;
          order_id: string;
          pattern?: string;
          rotation?: number;
          shape?: string;
          updated_at?: string;
          user_id?: string;
          width?: number;
          x?: number;
          y?: number;
          z_index?: number;
        };
        Update: {
          color?: string | null;
          color2?: string | null;
          content?: string | null;
          created_at?: string;
          height?: number;
          id?: string;
          image_url?: string | null;
          kind?: string;
          order_id?: string;
          pattern?: string;
          rotation?: number;
          shape?: string;
          updated_at?: string;
          user_id?: string;
          width?: number;
          x?: number;
          y?: number;
          z_index?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_moodboard_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_preferred_ingredients: {
        Row: {
          created_at: string;
          id: string;
          ingredient_id: string;
          order_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          ingredient_id: string;
          order_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          ingredient_id?: string;
          order_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_preferred_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_preferred_ingredients_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_result_photos: {
        Row: {
          caption: string | null;
          created_at: string;
          id: string;
          image_url: string;
          order_id: string;
          sort_order: number;
          user_id: string;
        };
        Insert: {
          caption?: string | null;
          created_at?: string;
          id?: string;
          image_url: string;
          order_id: string;
          sort_order?: number;
          user_id?: string;
        };
        Update: {
          caption?: string | null;
          created_at?: string;
          id?: string;
          image_url?: string;
          order_id?: string;
          sort_order?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_result_photos_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          allergy_notes: string | null;
          audience: string | null;
          cake_size: Database["public"]["Enums"]["order_cake_size"] | null;
          cake_size_id: string | null;
          cake_size_legacy: string | null;
          created_at: string;
          custom_size: string | null;
          custom_size_cm: number | null;
          customer_feedback: string | null;
          customer_id: string | null;
          customer_satisfaction: number | null;
          delivery_address: string | null;
          dietary_build_id: string | null;
          design_notes: string | null;
          dietary_requirements: string | null;
          least_liked_flavours: string | null;
          event_date: string | null;
          extracted_json: Json | null;
          flavoring_cream_formula_id: string | null;
          flavoring_filling_formula_id: string | null;
          flavoring_note: string | null;
          flavoring_sheet_formula_id: string | null;
          google_calendar_event_id: string | null;
          has_allergies: boolean;
          id: string;
          is_in_progress: boolean;
          maker_notes: string | null;
          maker_satisfaction: number | null;
          notes: string | null;
          occasion: Database["public"]["Enums"]["order_occasion"] | null;
          occasion_legacy: string | null;
          occasion_other_note: string | null;
          order_number: string;
          payment_status: Database["public"]["Enums"]["order_payment_status"] | null;
          payment_status_legacy: string | null;
          pickup_at: string | null;
          price: number | null;
          product_id: string | null;
          product_line: string | null;
          product_size_id: string | null;
          quantity: number | null;
          raw_dm_text: string | null;
          recipient: string | null;
          recipient_relationship:
            Database["public"]["Enums"]["order_recipient_relationship"] | null;
          recipient_relationship_other_note: string | null;
          requester_legacy: string | null;
          servings: number | null;
          sheet_mould_id: string | null;
          status: string;
          updated_at: string;
          user_id: string;
          wann_delivery_task_id: string | null;
          wann_order_link_task_id: string | null;
          wann_project_id: string | null;
        };
        Insert: {
          allergy_notes?: string | null;
          audience?: string | null;
          cake_size?: Database["public"]["Enums"]["order_cake_size"] | null;
          cake_size_id?: string | null;
          cake_size_legacy?: string | null;
          created_at?: string;
          custom_size?: string | null;
          custom_size_cm?: number | null;
          customer_feedback?: string | null;
          customer_id?: string | null;
          customer_satisfaction?: number | null;
          delivery_address?: string | null;
          dietary_build_id?: string | null;
          design_notes?: string | null;
          dietary_requirements?: string | null;
          least_liked_flavours?: string | null;
          event_date?: string | null;
          extracted_json?: Json | null;
          flavoring_cream_formula_id?: string | null;
          flavoring_filling_formula_id?: string | null;
          flavoring_note?: string | null;
          flavoring_sheet_formula_id?: string | null;
          google_calendar_event_id?: string | null;
          has_allergies?: boolean;
          id?: string;
          is_in_progress?: boolean;
          maker_notes?: string | null;
          maker_satisfaction?: number | null;
          notes?: string | null;
          occasion?: Database["public"]["Enums"]["order_occasion"] | null;
          occasion_legacy?: string | null;
          occasion_other_note?: string | null;
          order_number: string;
          payment_status?: Database["public"]["Enums"]["order_payment_status"] | null;
          payment_status_legacy?: string | null;
          pickup_at?: string | null;
          price?: number | null;
          product_id?: string | null;
          product_line?: string | null;
          product_size_id?: string | null;
          quantity?: number | null;
          raw_dm_text?: string | null;
          recipient?: string | null;
          recipient_relationship?:
            Database["public"]["Enums"]["order_recipient_relationship"] | null;
          recipient_relationship_other_note?: string | null;
          requester_legacy?: string | null;
          servings?: number | null;
          sheet_mould_id?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
          wann_delivery_task_id?: string | null;
          wann_order_link_task_id?: string | null;
          wann_project_id?: string | null;
        };
        Update: {
          allergy_notes?: string | null;
          audience?: string | null;
          cake_size?: Database["public"]["Enums"]["order_cake_size"] | null;
          cake_size_id?: string | null;
          cake_size_legacy?: string | null;
          created_at?: string;
          custom_size?: string | null;
          custom_size_cm?: number | null;
          customer_feedback?: string | null;
          customer_id?: string | null;
          customer_satisfaction?: number | null;
          delivery_address?: string | null;
          dietary_build_id?: string | null;
          design_notes?: string | null;
          dietary_requirements?: string | null;
          least_liked_flavours?: string | null;
          event_date?: string | null;
          extracted_json?: Json | null;
          flavoring_cream_formula_id?: string | null;
          flavoring_filling_formula_id?: string | null;
          flavoring_note?: string | null;
          flavoring_sheet_formula_id?: string | null;
          google_calendar_event_id?: string | null;
          has_allergies?: boolean;
          id?: string;
          is_in_progress?: boolean;
          maker_notes?: string | null;
          maker_satisfaction?: number | null;
          notes?: string | null;
          occasion?: Database["public"]["Enums"]["order_occasion"] | null;
          occasion_legacy?: string | null;
          occasion_other_note?: string | null;
          order_number?: string;
          payment_status?: Database["public"]["Enums"]["order_payment_status"] | null;
          payment_status_legacy?: string | null;
          pickup_at?: string | null;
          price?: number | null;
          product_id?: string | null;
          product_line?: string | null;
          product_size_id?: string | null;
          quantity?: number | null;
          raw_dm_text?: string | null;
          recipient?: string | null;
          recipient_relationship?:
            Database["public"]["Enums"]["order_recipient_relationship"] | null;
          recipient_relationship_other_note?: string | null;
          requester_legacy?: string | null;
          servings?: number | null;
          sheet_mould_id?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
          wann_delivery_task_id?: string | null;
          wann_order_link_task_id?: string | null;
          wann_project_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_cake_size_id_fkey";
            columns: ["cake_size_id"];
            isOneToOne: false;
            referencedRelation: "cake_sizes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_flavoring_cream_formula_id_fkey";
            columns: ["flavoring_cream_formula_id"];
            isOneToOne: false;
            referencedRelation: "formulas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_flavoring_filling_formula_id_fkey";
            columns: ["flavoring_filling_formula_id"];
            isOneToOne: false;
            referencedRelation: "formulas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_flavoring_sheet_formula_id_fkey";
            columns: ["flavoring_sheet_formula_id"];
            isOneToOne: false;
            referencedRelation: "formulas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_product_size_id_fkey";
            columns: ["product_size_id"];
            isOneToOne: false;
            referencedRelation: "product_sizes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_sheet_mould_id_fkey";
            columns: ["sheet_mould_id"];
            isOneToOne: false;
            referencedRelation: "moulds";
            referencedColumns: ["id"];
          },
        ];
      };
      pilot_settings: {
        Row: {
          ics_feed_token: string | null;
          monthly_overhead: number;
          monthly_unit_count: number;
          order_status_colors: Json;
          product_page_section_order: string[] | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          ics_feed_token?: string | null;
          monthly_overhead?: number;
          monthly_unit_count?: number;
          order_status_colors?: Json;
          product_page_section_order?: string[] | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          ics_feed_token?: string | null;
          monthly_overhead?: number;
          monthly_unit_count?: number;
          order_status_colors?: Json;
          product_page_section_order?: string[] | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      product_allergen_ingredients: {
        Row: {
          created_at: string;
          id: string;
          ingredient_id: string;
          product_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          ingredient_id: string;
          product_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          ingredient_id?: string;
          product_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_allergen_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_allergen_ingredients_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_components: {
        Row: {
          component_id: string | null;
          created_at: string;
          formula_version_id: string | null;
          id: string;
          ingredient_id: string | null;
          product_id: string;
          product_size_id: string | null;
          quantity_g: number | null;
          sort_order: number;
          user_id: string;
        };
        Insert: {
          component_id?: string | null;
          created_at?: string;
          formula_version_id?: string | null;
          id?: string;
          ingredient_id?: string | null;
          product_id: string;
          product_size_id?: string | null;
          quantity_g?: number | null;
          sort_order?: number;
          user_id: string;
        };
        Update: {
          component_id?: string | null;
          created_at?: string;
          formula_version_id?: string | null;
          id?: string;
          ingredient_id?: string | null;
          product_id?: string;
          product_size_id?: string | null;
          quantity_g?: number | null;
          sort_order?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_components_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "components";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_components_formula_version_id_fkey";
            columns: ["formula_version_id"];
            isOneToOne: false;
            referencedRelation: "formula_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_components_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_components_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_components_product_size_id_fkey";
            columns: ["product_size_id"];
            isOneToOne: false;
            referencedRelation: "product_sizes";
            referencedColumns: ["id"];
          },
        ];
      };
      product_cost_items: {
        Row: {
          cost_item_id: string;
          created_at: string;
          id: string;
          product_id: string;
          quantity: number;
          user_id: string;
        };
        Insert: {
          cost_item_id: string;
          created_at?: string;
          id?: string;
          product_id: string;
          quantity?: number;
          user_id?: string;
        };
        Update: {
          cost_item_id?: string;
          created_at?: string;
          id?: string;
          product_id?: string;
          quantity?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_cost_items_cost_item_id_fkey";
            columns: ["cost_item_id"];
            isOneToOne: false;
            referencedRelation: "cost_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_cost_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_preferred_ingredients: {
        Row: {
          created_at: string;
          id: string;
          ingredient_id: string;
          product_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          ingredient_id: string;
          product_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          ingredient_id?: string;
          product_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_preferred_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_preferred_ingredients_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_sizes: {
        Row: {
          cake_size_id: string | null;
          created_at: string;
          diameter_mm: number | null;
          finished_diameter_mm: number | null;
          finished_height_mm: number | null;
          mould_diameter_mm: number | null;
          height_mm: number | null;
          id: string;
          is_default: boolean;
          length_mm: number | null;
          monthly_unit_count: number | null;
          mould_id: string | null;
          notes: string | null;
          product_id: string;
          selling_price: number | null;
          shape: string;
          updated_at: string;
          user_id: string;
          width_mm: number | null;
        };
        Insert: {
          cake_size_id?: string | null;
          created_at?: string;
          diameter_mm?: number | null;
          finished_diameter_mm?: number | null;
          finished_height_mm?: number | null;
          mould_diameter_mm?: number | null;
          height_mm?: number | null;
          id?: string;
          is_default?: boolean;
          length_mm?: number | null;
          monthly_unit_count?: number | null;
          mould_id?: string | null;
          notes?: string | null;
          product_id: string;
          selling_price?: number | null;
          shape: string;
          updated_at?: string;
          user_id: string;
          width_mm?: number | null;
        };
        Update: {
          cake_size_id?: string | null;
          created_at?: string;
          diameter_mm?: number | null;
          finished_diameter_mm?: number | null;
          finished_height_mm?: number | null;
          mould_diameter_mm?: number | null;
          height_mm?: number | null;
          id?: string;
          is_default?: boolean;
          length_mm?: number | null;
          monthly_unit_count?: number | null;
          mould_id?: string | null;
          notes?: string | null;
          product_id?: string;
          selling_price?: number | null;
          shape?: string;
          updated_at?: string;
          user_id?: string;
          width_mm?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_sizes_mould_id_fkey";
            columns: ["mould_id"];
            isOneToOne: false;
            referencedRelation: "moulds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_sizes_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          allergy_notes: string | null;
          category_id: string | null;
          created_at: string;
          description: string | null;
          has_allergies: boolean;
          id: string;
          image_actual_url: string | null;
          image_cross_section_actual_url: string | null;
          image_cross_section_layout_url: string | null;
          image_imagination_url: string | null;
          name: string;
          notes: string | null;
          pinned: boolean;
          product_target: Json;
          status: Database["public"]["Enums"]["product_status"];
          target_customer_notes: string | null;
          technique_category_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          allergy_notes?: string | null;
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          has_allergies?: boolean;
          id?: string;
          image_actual_url?: string | null;
          image_cross_section_actual_url?: string | null;
          image_cross_section_layout_url?: string | null;
          image_imagination_url?: string | null;
          name: string;
          notes?: string | null;
          pinned?: boolean;
          product_target?: Json;
          status?: Database["public"]["Enums"]["product_status"];
          target_customer_notes?: string | null;
          technique_category_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          allergy_notes?: string | null;
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          has_allergies?: boolean;
          id?: string;
          image_actual_url?: string | null;
          image_cross_section_actual_url?: string | null;
          image_cross_section_layout_url?: string | null;
          image_imagination_url?: string | null;
          name?: string;
          notes?: string | null;
          pinned?: boolean;
          product_target?: Json;
          status?: Database["public"]["Enums"]["product_status"];
          target_customer_notes?: string | null;
          technique_category_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_technique_category_id_fkey";
            columns: ["technique_category_id"];
            isOneToOne: false;
            referencedRelation: "technique_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      reference_entries: {
        Row: {
          author: string | null;
          component_id: string | null;
          created_at: string;
          id: string;
          ingredient_id: string | null;
          note: string;
          product_id: string | null;
          source_type: string;
          technique_category_id: string | null;
          title: string;
          updated_at: string;
          url: string | null;
          user_id: string;
        };
        Insert: {
          author?: string | null;
          component_id?: string | null;
          created_at?: string;
          id?: string;
          ingredient_id?: string | null;
          note?: string;
          product_id?: string | null;
          source_type?: string;
          technique_category_id?: string | null;
          title: string;
          updated_at?: string;
          url?: string | null;
          user_id: string;
        };
        Update: {
          author?: string | null;
          component_id?: string | null;
          created_at?: string;
          id?: string;
          ingredient_id?: string | null;
          note?: string;
          product_id?: string | null;
          source_type?: string;
          technique_category_id?: string | null;
          title?: string;
          updated_at?: string;
          url?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reference_entries_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "components";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reference_entries_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reference_entries_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reference_entries_technique_category_id_fkey";
            columns: ["technique_category_id"];
            isOneToOne: false;
            referencedRelation: "technique_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      shco_admins: {
        Row: {
          created_at: string;
          email: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      shco_email_log: {
        Row: {
          created_at: string;
          error: string | null;
          id: string;
          kind: string;
          recipients: string[];
          request_id: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          id?: string;
          kind: string;
          recipients?: string[];
          request_id?: string | null;
          status: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          id?: string;
          kind?: string;
          recipients?: string[];
          request_id?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shco_email_log_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "shco_order_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      shco_notification_emails: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          is_active: boolean;
          label: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          is_active?: boolean;
          label?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          is_active?: boolean;
          label?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      shco_order_requests: {
        Row: {
          abn: string | null;
          admin_notes: string | null;
          allergy_notes: string | null;
          audience: string | null;
          card_brand: string | null;
          card_last4: string | null;
          card_status: string;
          created_at: string;
          customer_email: string;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string;
          customisation_notes: string | null;
          customised: boolean;
          decided_at: string | null;
          decline_reason: string | null;
          delivery_address: string | null;
          excluded_ingredients: string[];
          excluded_other_note: string | null;
          function_description: string | null;
          google_calendar_event_id: string | null;
          has_allergies: boolean;
          id: string;
          occasion: string | null;
          order_id: string | null;
          order_type: string;
          paid_at: string | null;
          pax: number | null;
          payment_error: string | null;
          payment_provider_ref: string | null;
          payment_url: string | null;
          price: number;
          price_breakdown: Json;
          recipient_name: string | null;
          recipient_relationship: string | null;
          request_number: string;
          required_at: string | null;
          status: string;
          stripe_customer_id: string | null;
          stripe_payment_method_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          abn?: string | null;
          admin_notes?: string | null;
          allergy_notes?: string | null;
          audience?: string | null;
          card_brand?: string | null;
          card_last4?: string | null;
          card_status?: string;
          created_at?: string;
          customer_email: string;
          customer_id?: string | null;
          customer_name: string;
          customer_phone: string;
          customisation_notes?: string | null;
          customised?: boolean;
          decided_at?: string | null;
          decline_reason?: string | null;
          delivery_address?: string | null;
          excluded_ingredients?: string[];
          excluded_other_note?: string | null;
          function_description?: string | null;
          google_calendar_event_id?: string | null;
          has_allergies?: boolean;
          id?: string;
          occasion?: string | null;
          order_id?: string | null;
          order_type: string;
          paid_at?: string | null;
          pax?: number | null;
          payment_error?: string | null;
          payment_provider_ref?: string | null;
          payment_url?: string | null;
          price: number;
          price_breakdown?: Json;
          recipient_name?: string | null;
          recipient_relationship?: string | null;
          request_number?: string;
          required_at?: string | null;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_payment_method_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          abn?: string | null;
          admin_notes?: string | null;
          allergy_notes?: string | null;
          audience?: string | null;
          card_brand?: string | null;
          card_last4?: string | null;
          card_status?: string;
          created_at?: string;
          customer_email?: string;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string;
          customisation_notes?: string | null;
          customised?: boolean;
          decided_at?: string | null;
          decline_reason?: string | null;
          delivery_address?: string | null;
          excluded_ingredients?: string[];
          excluded_other_note?: string | null;
          function_description?: string | null;
          google_calendar_event_id?: string | null;
          has_allergies?: boolean;
          id?: string;
          occasion?: string | null;
          order_id?: string | null;
          order_type?: string;
          paid_at?: string | null;
          pax?: number | null;
          payment_error?: string | null;
          payment_provider_ref?: string | null;
          payment_url?: string | null;
          price?: number;
          price_breakdown?: Json;
          recipient_name?: string | null;
          recipient_relationship?: string | null;
          request_number?: string;
          required_at?: string | null;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_payment_method_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shco_order_requests_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shco_order_requests_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      shco_settings: {
        Row: {
          calendar_id: string | null;
          function_custom_per_person: number;
          function_max_pax: number;
          function_min_pax: number;
          gift_price: number;
          order_password_hash: string;
          stripe_enabled: boolean;
          timezone: string;
          updated_at: string;
          user_id: string;
          wedding_enabled: boolean;
        };
        Insert: {
          calendar_id?: string | null;
          function_custom_per_person?: number;
          function_max_pax?: number;
          function_min_pax?: number;
          gift_price?: number;
          order_password_hash: string;
          stripe_enabled?: boolean;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
          wedding_enabled?: boolean;
        };
        Update: {
          calendar_id?: string | null;
          function_custom_per_person?: number;
          function_max_pax?: number;
          function_min_pax?: number;
          gift_price?: number;
          order_password_hash?: string;
          stripe_enabled?: boolean;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
          wedding_enabled?: boolean;
        };
        Relationships: [];
      };
      packaging_items: {
        Row: {
          created_at: string;
          height_mm: number | null;
          id: string;
          kind: string;
          length_mm: number;
          note: string | null;
          quantity: number;
          updated_at: string;
          user_id: string;
          width_mm: number;
        };
        Insert: {
          created_at?: string;
          height_mm?: number | null;
          id?: string;
          kind: string;
          length_mm: number;
          note?: string | null;
          quantity?: number;
          updated_at?: string;
          user_id?: string;
          width_mm: number;
        };
        Update: {
          created_at?: string;
          height_mm?: number | null;
          id?: string;
          kind?: string;
          length_mm?: number;
          note?: string | null;
          quantity?: number;
          updated_at?: string;
          user_id?: string;
          width_mm?: number;
        };
        Relationships: [];
      };
      stock_item_lines: {
        Row: {
          created_at: string;
          height_mm: number | null;
          id: string;
          length_mm: number | null;
          mould_id: string | null;
          mould_qty: number | null;
          note: string | null;
          quantity: number;
          stock_item_id: string;
          unit_label: string;
          updated_at: string;
          user_id: string;
          width_mm: number | null;
        };
        Insert: {
          created_at?: string;
          height_mm?: number | null;
          id?: string;
          length_mm?: number | null;
          mould_id?: string | null;
          mould_qty?: number | null;
          note?: string | null;
          quantity?: number;
          stock_item_id: string;
          unit_label?: string;
          updated_at?: string;
          user_id?: string;
          width_mm?: number | null;
        };
        Update: {
          created_at?: string;
          height_mm?: number | null;
          id?: string;
          length_mm?: number | null;
          mould_id?: string | null;
          mould_qty?: number | null;
          note?: string | null;
          quantity?: number;
          stock_item_id?: string;
          unit_label?: string;
          updated_at?: string;
          user_id?: string;
          width_mm?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_item_lines_stock_item_id_fkey";
            columns: ["stock_item_id"];
            isOneToOne: false;
            referencedRelation: "stock_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_item_lines_mould_id_fkey";
            columns: ["mould_id"];
            isOneToOne: false;
            referencedRelation: "moulds";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_items: {
        Row: {
          area_cm2: number | null;
          height_mm: number | null;
          mould_id: string | null;
          mould_qty: number | null;
          component_id: string | null;
          created_at: string;
          id: string;
          item_type: string;
          notes: string | null;
          product_size_id: string | null;
          quantity: number;
          unit_label: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          area_cm2?: number | null;
          height_mm?: number | null;
          mould_id?: string | null;
          mould_qty?: number | null;
          component_id?: string | null;
          created_at?: string;
          id?: string;
          item_type: string;
          notes?: string | null;
          product_size_id?: string | null;
          quantity?: number;
          unit_label?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          area_cm2?: number | null;
          height_mm?: number | null;
          mould_id?: string | null;
          mould_qty?: number | null;
          component_id?: string | null;
          created_at?: string;
          id?: string;
          item_type?: string;
          notes?: string | null;
          product_size_id?: string | null;
          quantity?: number;
          unit_label?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_items_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "components";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_items_mould_id_fkey";
            columns: ["mould_id"];
            isOneToOne: false;
            referencedRelation: "moulds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_items_product_size_id_fkey";
            columns: ["product_size_id"];
            isOneToOne: false;
            referencedRelation: "product_sizes";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_movements: {
        Row: {
          created_at: string;
          id: string;
          note: string | null;
          quantity_delta: number;
          reason: string;
          stock_item_id: string;
          user_id: string;
          work_session_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          note?: string | null;
          quantity_delta: number;
          reason: string;
          stock_item_id: string;
          user_id?: string;
          work_session_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          note?: string | null;
          quantity_delta?: number;
          reason?: string;
          stock_item_id?: string;
          user_id?: string;
          work_session_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_stock_item_id_fkey";
            columns: ["stock_item_id"];
            isOneToOne: false;
            referencedRelation: "stock_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_work_session_id_fkey";
            columns: ["work_session_id"];
            isOneToOne: false;
            referencedRelation: "work_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      task_type_colors: {
        Row: {
          color_class: string;
          created_at: string;
          id: string;
          task_type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          color_class: string;
          created_at?: string;
          id?: string;
          task_type: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          color_class?: string;
          created_at?: string;
          id?: string;
          task_type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      task_type_definitions: {
        Row: {
          created_at: string;
          has_observation_fields: boolean;
          id: string;
          key: string;
          name: string;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          has_observation_fields?: boolean;
          id?: string;
          key: string;
          name: string;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          has_observation_fields?: boolean;
          id?: string;
          key?: string;
          name?: string;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      technique_categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          name_en: string | null;
          notes: string | null;
          parent_id: string | null;
          slot_group: string | null;
          sort_order: number;
          suggested_base_formula: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          name_en?: string | null;
          notes?: string | null;
          parent_id?: string | null;
          slot_group?: string | null;
          sort_order?: number;
          suggested_base_formula?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          name_en?: string | null;
          notes?: string | null;
          parent_id?: string | null;
          slot_group?: string | null;
          sort_order?: number;
          suggested_base_formula?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "technique_categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "technique_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      technique_category_ingredient_group_order: {
        Row: {
          created_at: string;
          group_id: string;
          id: string;
          sort_order: number;
          technique_category_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          id?: string;
          sort_order?: number;
          technique_category_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          id?: string;
          sort_order?: number;
          technique_category_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "technique_category_ingredient_group__technique_category_id_fkey";
            columns: ["technique_category_id"];
            isOneToOne: false;
            referencedRelation: "technique_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "technique_category_ingredient_group_order_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "ingredient_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      work_blocks: {
        Row: {
          block_date: string;
          created_at: string;
          end_time: string;
          id: string;
          part_no: number;
          planner_task_id: string | null;
          start_time: string;
          step_name: string | null;
          step_template_task_id: string | null;
          updated_at: string;
          user_id: string;
          work_session_formula_version_id: string;
          work_session_task_id: string | null;
        };
        Insert: {
          block_date: string;
          created_at?: string;
          end_time: string;
          id?: string;
          part_no?: number;
          planner_task_id?: string | null;
          start_time: string;
          step_name?: string | null;
          step_template_task_id?: string | null;
          updated_at?: string;
          user_id?: string;
          work_session_formula_version_id: string;
          work_session_task_id?: string | null;
        };
        Update: {
          block_date?: string;
          created_at?: string;
          end_time?: string;
          id?: string;
          part_no?: number;
          planner_task_id?: string | null;
          start_time?: string;
          step_name?: string | null;
          step_template_task_id?: string | null;
          updated_at?: string;
          user_id?: string;
          work_session_formula_version_id?: string;
          work_session_task_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "work_blocks_work_session_formula_version_id_fkey";
            columns: ["work_session_formula_version_id"];
            isOneToOne: false;
            referencedRelation: "work_session_formula_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      work_session_formula_versions: {
        Row: {
          added_at: string;
          base_weight_id: string | null;
          base_weight_qty: number | null;
          capacity_id: string | null;
          capacity_qty: number | null;
          formula_version_id: string;
          id: string;
          kind: string;
          mould_id: string | null;
          mould_qty: number | null;
          multiplier: number;
          planner_task_id: string | null;
          slot: string | null;
          sort_order: number;
          updated_at: string;
          user_id: string;
          work_session_id: string;
        };
        Insert: {
          added_at?: string;
          base_weight_id?: string | null;
          base_weight_qty?: number | null;
          capacity_id?: string | null;
          capacity_qty?: number | null;
          formula_version_id: string;
          id?: string;
          kind?: string;
          mould_id?: string | null;
          mould_qty?: number | null;
          multiplier?: number;
          planner_task_id?: string | null;
          slot?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
          work_session_id: string;
        };
        Update: {
          added_at?: string;
          base_weight_id?: string | null;
          base_weight_qty?: number | null;
          capacity_id?: string | null;
          capacity_qty?: number | null;
          formula_version_id?: string;
          id?: string;
          kind?: string;
          mould_id?: string | null;
          mould_qty?: number | null;
          multiplier?: number;
          planner_task_id?: string | null;
          slot?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
          work_session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_session_formula_versions_base_weight_id_fkey";
            columns: ["base_weight_id"];
            isOneToOne: false;
            referencedRelation: "base_weight_presets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_session_formula_versions_capacity_id_fkey";
            columns: ["capacity_id"];
            isOneToOne: false;
            referencedRelation: "capacities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_session_formula_versions_formula_version_id_fkey";
            columns: ["formula_version_id"];
            isOneToOne: false;
            referencedRelation: "formula_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_session_formula_versions_mould_id_fkey";
            columns: ["mould_id"];
            isOneToOne: false;
            referencedRelation: "moulds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_session_formula_versions_work_session_id_fkey";
            columns: ["work_session_id"];
            isOneToOne: false;
            referencedRelation: "work_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      work_session_multiplier_history: {
        Row: {
          applied_at: string;
          applied_multiplier: number;
          formula_version_id: string;
          id: string;
          previous_multiplier: number;
          resulting_working_quantity_snapshot: Json | null;
          user_id: string;
          work_session_formula_version_id: string | null;
          work_session_id: string;
        };
        Insert: {
          applied_at?: string;
          applied_multiplier: number;
          formula_version_id: string;
          id?: string;
          previous_multiplier: number;
          resulting_working_quantity_snapshot?: Json | null;
          user_id: string;
          work_session_formula_version_id?: string | null;
          work_session_id: string;
        };
        Update: {
          applied_at?: string;
          applied_multiplier?: number;
          formula_version_id?: string;
          id?: string;
          previous_multiplier?: number;
          resulting_working_quantity_snapshot?: Json | null;
          user_id?: string;
          work_session_formula_version_id?: string | null;
          work_session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_session_multiplier_histo_work_session_formula_version_fkey";
            columns: ["work_session_formula_version_id"];
            isOneToOne: false;
            referencedRelation: "work_session_formula_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_session_multiplier_history_formula_version_id_fkey";
            columns: ["formula_version_id"];
            isOneToOne: false;
            referencedRelation: "formula_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_session_multiplier_history_work_session_id_fkey";
            columns: ["work_session_id"];
            isOneToOne: false;
            referencedRelation: "work_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      work_session_progress: {
        Row: {
          formula_version_ingredient_id: string;
          id: string;
          note: string | null;
          status: string;
          updated_at: string;
          user_id: string;
          work_session_formula_version_id: string;
          work_session_id: string;
        };
        Insert: {
          formula_version_ingredient_id: string;
          id?: string;
          note?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
          work_session_formula_version_id: string;
          work_session_id: string;
        };
        Update: {
          formula_version_ingredient_id?: string;
          id?: string;
          note?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
          work_session_formula_version_id?: string;
          work_session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_session_progress_formula_version_ingredient_id_fkey";
            columns: ["formula_version_ingredient_id"];
            isOneToOne: false;
            referencedRelation: "formula_version_ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_session_progress_work_session_formula_version_id_fkey";
            columns: ["work_session_formula_version_id"];
            isOneToOne: false;
            referencedRelation: "work_session_formula_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_session_progress_work_session_id_fkey";
            columns: ["work_session_id"];
            isOneToOne: false;
            referencedRelation: "work_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      work_session_task_ingredients: {
        Row: {
          created_at: string;
          formula_version_ingredient_id: string;
          id: string;
          task_id: string;
          user_id: string;
          work_session_id: string;
        };
        Insert: {
          created_at?: string;
          formula_version_ingredient_id: string;
          id?: string;
          task_id: string;
          user_id?: string;
          work_session_id: string;
        };
        Update: {
          created_at?: string;
          formula_version_ingredient_id?: string;
          id?: string;
          task_id?: string;
          user_id?: string;
          work_session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_session_task_ingredients_formula_version_ingredient_i_fkey";
            columns: ["formula_version_ingredient_id"];
            isOneToOne: false;
            referencedRelation: "formula_version_ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_session_task_ingredients_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "work_session_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_session_task_ingredients_work_session_id_fkey";
            columns: ["work_session_id"];
            isOneToOne: false;
            referencedRelation: "work_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      work_session_task_predecessors: {
        Row: {
          created_at: string;
          id: string;
          predecessor_task_id: string;
          task_id: string;
          user_id: string;
          work_session_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          predecessor_task_id: string;
          task_id: string;
          user_id?: string;
          work_session_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          predecessor_task_id?: string;
          task_id?: string;
          user_id?: string;
          work_session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_session_task_predecessors_predecessor_task_id_fkey";
            columns: ["predecessor_task_id"];
            isOneToOne: false;
            referencedRelation: "work_session_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_session_task_predecessors_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "work_session_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_session_task_predecessors_work_session_id_fkey";
            columns: ["work_session_id"];
            isOneToOne: false;
            referencedRelation: "work_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      work_session_tasks: {
        Row: {
          active_labour_minutes: number | null;
          actual_started_at: string | null;
          checklist_items: Json | null;
          completed_at: string | null;
          component_id: string | null;
          created_at: string;
          formula_version_id: string | null;
          id: string;
          is_optional: boolean;
          note: string | null;
          observation_height_end_mm: number | null;
          observation_height_mid_mm: number | null;
          observation_height_start_mm: number | null;
          observation_status: string | null;
          observation_temperature_c: number | null;
          output_quantity: number | null;
          output_unit: string | null;
          planned_end_at: string | null;
          planned_start_at: string | null;
          predecessor_task_id: string | null;
          sort_order: number;
          status: string;
          task_name: string;
          task_type: string | null;
          timer_minutes: number | null;
          updated_at: string;
          user_id: string;
          work_session_id: string;
        };
        Insert: {
          active_labour_minutes?: number | null;
          actual_started_at?: string | null;
          checklist_items?: Json | null;
          completed_at?: string | null;
          component_id?: string | null;
          created_at?: string;
          formula_version_id?: string | null;
          id?: string;
          is_optional?: boolean;
          note?: string | null;
          observation_height_end_mm?: number | null;
          observation_height_mid_mm?: number | null;
          observation_height_start_mm?: number | null;
          observation_status?: string | null;
          observation_temperature_c?: number | null;
          output_quantity?: number | null;
          output_unit?: string | null;
          planned_end_at?: string | null;
          planned_start_at?: string | null;
          predecessor_task_id?: string | null;
          sort_order?: number;
          status?: string;
          task_name: string;
          task_type?: string | null;
          timer_minutes?: number | null;
          updated_at?: string;
          user_id: string;
          work_session_id: string;
        };
        Update: {
          active_labour_minutes?: number | null;
          actual_started_at?: string | null;
          checklist_items?: Json | null;
          completed_at?: string | null;
          component_id?: string | null;
          created_at?: string;
          formula_version_id?: string | null;
          id?: string;
          is_optional?: boolean;
          note?: string | null;
          observation_height_end_mm?: number | null;
          observation_height_mid_mm?: number | null;
          observation_height_start_mm?: number | null;
          observation_status?: string | null;
          observation_temperature_c?: number | null;
          output_quantity?: number | null;
          output_unit?: string | null;
          planned_end_at?: string | null;
          planned_start_at?: string | null;
          predecessor_task_id?: string | null;
          sort_order?: number;
          status?: string;
          task_name?: string;
          task_type?: string | null;
          timer_minutes?: number | null;
          updated_at?: string;
          user_id?: string;
          work_session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_session_tasks_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "components";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_session_tasks_formula_version_id_fkey";
            columns: ["formula_version_id"];
            isOneToOne: false;
            referencedRelation: "formula_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_session_tasks_predecessor_task_id_fkey";
            columns: ["predecessor_task_id"];
            isOneToOne: false;
            referencedRelation: "work_session_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_session_tasks_work_session_id_fkey";
            columns: ["work_session_id"];
            isOneToOne: false;
            referencedRelation: "work_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      work_sessions: {
        Row: {
          completed_at: string | null;
          cake_size_id: string | null;
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          order_id: string | null;
          product_id: string | null;
          product_size_id: string | null;
          scheduled_date: string | null;
          scheduled_end_time: string | null;
          scheduled_start_time: string | null;
          started_at: string | null;
          status: string;
          target_unit_count: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          cake_size_id?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          order_id?: string | null;
          product_id?: string | null;
          product_size_id?: string | null;
          scheduled_date?: string | null;
          scheduled_end_time?: string | null;
          scheduled_start_time?: string | null;
          started_at?: string | null;
          status?: string;
          target_unit_count?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          cake_size_id?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          order_id?: string | null;
          product_id?: string | null;
          product_size_id?: string | null;
          scheduled_date?: string | null;
          scheduled_end_time?: string | null;
          scheduled_start_time?: string | null;
          started_at?: string | null;
          status?: string;
          target_unit_count?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_sessions_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_sessions_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_sessions_product_size_id_fkey";
            columns: ["product_size_id"];
            isOneToOne: false;
            referencedRelation: "product_sizes";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_template_task_predecessors: {
        Row: {
          id: string;
          predecessor_task_id: string;
          task_id: string;
          template_id: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          predecessor_task_id: string;
          task_id: string;
          template_id: string;
          user_id?: string;
        };
        Update: {
          id?: string;
          predecessor_task_id?: string;
          task_id?: string;
          template_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_template_task_predecessors_predecessor_task_id_fkey";
            columns: ["predecessor_task_id"];
            isOneToOne: false;
            referencedRelation: "workflow_template_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_template_task_predecessors_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "workflow_template_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_template_task_predecessors_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "workflow_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_template_tasks: {
        Row: {
          checklist_items: string[] | null;
          created_at: string;
          id: string;
          is_optional: boolean;
          sort_order: number;
          task_name: string;
          task_type: string | null;
          template_id: string;
          timer_minutes: number | null;
          user_id: string;
        };
        Insert: {
          checklist_items?: string[] | null;
          created_at?: string;
          id?: string;
          is_optional?: boolean;
          sort_order?: number;
          task_name: string;
          task_type?: string | null;
          template_id: string;
          timer_minutes?: number | null;
          user_id?: string;
        };
        Update: {
          checklist_items?: string[] | null;
          created_at?: string;
          id?: string;
          is_optional?: boolean;
          sort_order?: number;
          task_name?: string;
          task_type?: string | null;
          template_id?: string;
          timer_minutes?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_template_tasks_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "workflow_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_templates: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          technique_category_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          technique_category_id: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          technique_category_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_templates_technique_category_id_fkey";
            columns: ["technique_category_id"];
            isOneToOne: false;
            referencedRelation: "technique_categories";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _tmp_delete_formula: { Args: { p_id: string }; Returns: undefined };
      _tmp_delete_formula_version: {
        Args: { p_id: string };
        Returns: undefined;
      };
      _tmp_delete_technique_category: {
        Args: { p_id: string };
        Returns: undefined;
      };
      accept_order_request: { Args: { p_request_id: string }; Returns: Json };
      decline_order_request: {
        Args: { p_reason?: string; p_request_id: string };
        Returns: undefined;
      };
      mark_order_request_paid: {
        Args: { p_provider_ref?: string; p_request_id: string };
        Returns: undefined;
      };
      seed_default_ingredients: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      seed_flavour_families: { Args: { p_user_id: string }; Returns: undefined };
      seed_process_parameter_definitions: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      seed_technique_categories: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      shco_audience_label: { Args: { p: string }; Returns: string };
      shco_card_required: { Args: never; Returns: boolean };
      shco_check_password: { Args: { p_password: string }; Returns: boolean };
      shco_dietary_text: {
        Args: { r: Database["public"]["Tables"]["shco_order_requests"]["Row"] };
        Returns: string;
      };
      shco_function_quote: { Args: { p_pax: number }; Returns: Json };
      shco_is_admin: { Args: never; Returns: boolean };
      shco_link_customer: {
        Args: { r: Database["public"]["Tables"]["shco_order_requests"]["Row"] };
        Returns: string;
      };
      shco_order_note: {
        Args: { r: Database["public"]["Tables"]["shco_order_requests"]["Row"] };
        Returns: string;
      };
      shco_owner_id: { Args: never; Returns: string };
      shco_phone_key: { Args: { p: string }; Returns: string };
      shco_price: {
        Args: { p_customised: boolean; p_order_type: string; p_pax: number };
        Returns: Json;
      };
      shco_quote: {
        Args: { p_order_type: string; p_pax?: number };
        Returns: Json;
      };
      shco_verify_hook_secret: { Args: { p_secret: string }; Returns: boolean };
      submit_order_request: {
        Args: { p_password: string; p_request: Json };
        Returns: Json;
      };
    };
    Enums: {
      development_outcome: "KEEP" | "FAILED" | "PARTIAL" | "REFERENCE";
      experiment_status: "PLANNED" | "RUNNING" | "COMPLETE" | "FAILED" | "CANCELLED";
      formula_status: "DRAFT" | "TESTING" | "CURRENT" | "SUPERSEDED" | "ARCHIVED" | "LOGGED";
      order_cake_size: '6" Round' | '8" Round' | '6" Square' | '8" Square' | "Custom";
      order_occasion:
        | "Birthday"
        | "Anniversary"
        | "Wedding"
        | "Engagement"
        | "Graduation"
        | "Promotion"
        | "Retirement"
        | "Achievement"
        | "New Baby"
        | "Housewarming"
        | "Thank You"
        | "Congratulations"
        | "Farewell"
        | "Corporate Event"
        | "Client Gift"
        | "Team Celebration"
        | "Mother's Day"
        | "Father's Day"
        | "Valentine's Day"
        | "Christmas"
        | "Easter"
        | "Lunar New Year"
        | "Just Because"
        | "Other";
      order_payment_status: "Unpaid" | "Deposit Paid" | "Paid in Full";
      order_recipient_relationship:
        | "Self"
        | "Partner"
        | "Spouse"
        | "Family"
        | "Friend"
        | "Colleague"
        | "Client"
        | "Customer"
        | "Team / Coworkers"
        | "Business / Organisation"
        | "Other";
      product_status: "IDEA" | "ACTIVE" | "TESTING" | "STABLE" | "ARCHIVED";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      development_outcome: ["KEEP", "FAILED", "PARTIAL", "REFERENCE"],
      experiment_status: ["PLANNED", "RUNNING", "COMPLETE", "FAILED", "CANCELLED"],
      formula_status: ["DRAFT", "TESTING", "CURRENT", "SUPERSEDED", "ARCHIVED", "LOGGED"],
      order_cake_size: ['6" Round', '8" Round', '6" Square', '8" Square', "Custom"],
      order_occasion: [
        "Birthday",
        "Anniversary",
        "Wedding",
        "Engagement",
        "Graduation",
        "Promotion",
        "Retirement",
        "Achievement",
        "New Baby",
        "Housewarming",
        "Thank You",
        "Congratulations",
        "Farewell",
        "Corporate Event",
        "Client Gift",
        "Team Celebration",
        "Mother's Day",
        "Father's Day",
        "Valentine's Day",
        "Christmas",
        "Easter",
        "Lunar New Year",
        "Just Because",
        "Other",
      ],
      order_payment_status: ["Unpaid", "Deposit Paid", "Paid in Full"],
      order_recipient_relationship: [
        "Self",
        "Partner",
        "Spouse",
        "Family",
        "Friend",
        "Colleague",
        "Client",
        "Customer",
        "Team / Coworkers",
        "Business / Organisation",
        "Other",
      ],
      product_status: ["IDEA", "ACTIVE", "TESTING", "STABLE", "ARCHIVED"],
    },
  },
} as const;
