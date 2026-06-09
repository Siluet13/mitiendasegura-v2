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
      business_settings: {
        Row: {
          id: string
          owner_id: string
          nombre_negocio: string
          razon_social: string | null
          telefono: string | null
          email: string | null
          direccion: string | null
          ciudad: string | null
          provincia: string | null
          pais: string | null
          moneda: string
          simbolo_moneda: string
          decimales: number
          logo_url: string | null
          mensaje_tickets: string | null
          observaciones: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          nombre_negocio: string
          razon_social?: string | null
          telefono?: string | null
          email?: string | null
          direccion?: string | null
          ciudad?: string | null
          provincia?: string | null
          pais?: string | null
          moneda?: string
          simbolo_moneda?: string
          decimales?: number
          logo_url?: string | null
          mensaje_tickets?: string | null
          observaciones?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          nombre_negocio?: string
          razon_social?: string | null
          telefono?: string | null
          email?: string | null
          direccion?: string | null
          ciudad?: string | null
          provincia?: string | null
          pais?: string | null
          moneda?: string
          simbolo_moneda?: string
          decimales?: number
          logo_url?: string | null
          mensaje_tickets?: string | null
          observaciones?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          nombre: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          id: string
          owner_id: string
          nombre: string
          telefono: string | null
          email: string | null
          direccion: string | null
          observaciones: string | null
          created_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          nombre: string
          telefono?: string | null
          email?: string | null
          direccion?: string | null
          observaciones?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          nombre?: string
          telefono?: string | null
          email?: string | null
          direccion?: string | null
          observaciones?: string | null
          created_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          activo: boolean
          category_id: string | null
          codigo_barras: string | null
          costo: number
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          owner_id: string
          precio: number
          sku: string | null
          stock: number
          stock_minimo: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          category_id?: string | null
          codigo_barras?: string | null
          costo?: number
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          owner_id: string
          precio?: number
          sku?: string | null
          stock?: number
          stock_minimo?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          category_id?: string | null
          codigo_barras?: string | null
          costo?: number
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          owner_id?: string
          precio?: number
          sku?: string | null
          stock?: number
          stock_minimo?: number
          updated_at?: string
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
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nombre: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          nombre?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nombre?: string | null
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          precio_unitario: number
          product_id: string
          sale_id: string
          subtotal: number
        }
        Insert: {
          cantidad: number
          created_at?: string
          id?: string
          precio_unitario: number
          product_id: string
          sale_id: string
          subtotal: number
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          precio_unitario?: number
          product_id?: string
          sale_id?: string
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          comprobante_numero: string | null
          comprobante_tipo: string | null
          created_at: string
          customer_id: string | null
          id: string
          observacion: string | null
          owner_id: string
          total: number
          user_id: string
        }
        Insert: {
          comprobante_numero?: string | null
          comprobante_tipo?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          observacion?: string | null
          owner_id: string
          total?: number
          user_id: string
        }
        Update: {
          comprobante_numero?: string | null
          comprobante_tipo?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          observacion?: string | null
          owner_id?: string
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          observacion: string | null
          owner_id: string
          product_id: string
          referencia_id: string | null
          referencia_tipo: string | null
          tipo: Database["public"]["Enums"]["stock_movement_type"]
          user_id: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          id?: string
          observacion?: string | null
          owner_id: string
          product_id: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo: Database["public"]["Enums"]["stock_movement_type"]
          user_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          observacion?: string | null
          owner_id?: string
          product_id?: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo?: Database["public"]["Enums"]["stock_movement_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_sale: {
        Args: { p_items: Json; p_observacion?: string; p_customer_id?: string }
        Returns: string
      }
      current_owner_id: { Args: never; Returns: string }
    }
    Enums: {
      stock_movement_type: "entrada" | "salida"
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
      stock_movement_type: ["entrada", "salida"],
    },
  },
} as const
