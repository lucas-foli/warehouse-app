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
      tenants: {
        Row: {
          id: string
          slug: string
          company_name: string
          logo_url: string | null
          primary_color: string
          secondary_color: string
          ui_preset: string
          theme_tokens: Json
          is_onboarded: boolean
          allow_self_signup: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          company_name: string
          logo_url?: string | null
          primary_color?: string
          secondary_color?: string
          ui_preset?: string
          theme_tokens?: Json
          is_onboarded?: boolean
          allow_self_signup?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          company_name?: string
          logo_url?: string | null
          primary_color?: string
          secondary_color?: string
          ui_preset?: string
          theme_tokens?: Json
          is_onboarded?: boolean
          allow_self_signup?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenant_members: {
        Row: {
          tenant_id: string
          user_id: string
          role: 'admin' | 'member'
          created_at: string
        }
        Insert: {
          tenant_id: string
          user_id: string
          role?: 'admin' | 'member'
          created_at?: string
        }
        Update: {
          tenant_id?: string
          user_id?: string
          role?: 'admin' | 'member'
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tenant_members_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      tenant_invites: {
        Row: {
          code: string
          tenant_id: string | null
          max_uses: number
          uses: number
          is_active: boolean
          expires_at: string | null
          allowed_slug: string | null
          created_at: string
        }
        Insert: {
          code: string
          tenant_id?: string | null
          max_uses?: number
          uses?: number
          is_active?: boolean
          expires_at?: string | null
          allowed_slug?: string | null
          created_at?: string
        }
        Update: {
          code?: string
          tenant_id?: string | null
          max_uses?: number
          uses?: number
          is_active?: boolean
          expires_at?: string | null
          allowed_slug?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tenant_invites_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      products: {
        Row: {
          id: string
          tenant_id: string | null
          sku: string
          name: string
          barcode: string | null
          status: string
          location: string
          qty: number
          min: number | null
          price: number | null
          total_sold: number | null
          image: string | null
          image_url: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          sku: string
          name: string
          barcode?: string | null
          status?: string
          location?: string
          qty?: number
          min?: number | null
          price?: number | null
          total_sold?: number | null
          image?: string | null
          image_url?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          sku?: string
          name?: string
          barcode?: string | null
          status?: string
          location?: string
          qty?: number
          min?: number | null
          price?: number | null
          total_sold?: number | null
          image?: string | null
          image_url?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'products_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      clients: {
        Row: {
          id: string
          tenant_id: string
          external_id: string | null
          name: string
          email: string | null
          phone: string | null
          city: string | null
          last_purchase_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          external_id?: string | null
          name: string
          email?: string | null
          phone?: string | null
          city?: string | null
          last_purchase_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          external_id?: string | null
          name?: string
          email?: string | null
          phone?: string | null
          city?: string | null
          last_purchase_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'clients_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      sellers: {
        Row: {
          id: string
          tenant_id: string
          external_id: string | null
          name: string
          email: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          external_id?: string | null
          name: string
          email?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          external_id?: string | null
          name?: string
          email?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sellers_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      sales_orders: {
        Row: {
          id: string
          tenant_id: string
          order_number: string
          client_id: string | null
          client_external_id: string | null
          seller_id: string | null
          seller_external_id: string | null
          status: string | null
          total_amount: number | null
          sold_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          order_number: string
          client_id?: string | null
          client_external_id?: string | null
          seller_id?: string | null
          seller_external_id?: string | null
          status?: string | null
          total_amount?: number | null
          sold_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          order_number?: string
          client_id?: string | null
          client_external_id?: string | null
          seller_id?: string | null
          seller_external_id?: string | null
          status?: string | null
          total_amount?: number | null
          sold_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sales_orders_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sales_orders_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sales_orders_seller_id_fkey'
            columns: ['seller_id']
            isOneToOne: false
            referencedRelation: 'sellers'
            referencedColumns: ['id']
          },
        ]
      }
      sales_items: {
        Row: {
          id: string
          tenant_id: string
          order_id: string | null
          order_number: string
          sku: string
          product_id: string | null
          qty: number
          unit_price: number | null
          total_price: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          order_id?: string | null
          order_number: string
          sku: string
          product_id?: string | null
          qty: number
          unit_price?: number | null
          total_price?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          order_id?: string | null
          order_number?: string
          sku?: string
          product_id?: string | null
          qty?: number
          unit_price?: number | null
          total_price?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sales_items_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sales_items_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'sales_orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sales_items_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      tenant_branding: {
        Row: {
          slug: string | null
          company_name: string | null
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          ui_preset: string | null
          theme_tokens: Json | null
        }
        Relationships: []
      }
    }
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// ---------------------------------------------------------------------------
// Convenience helper types (mirrors the pattern from supabase-js codegen)
// ---------------------------------------------------------------------------

type PublicSchema = Database['public']

export type Tables<
  T extends keyof PublicSchema['Tables'],
  Alias extends keyof PublicSchema['Tables'][T] = 'Row',
> = PublicSchema['Tables'][T][Alias]

export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update']

export type Views<T extends keyof PublicSchema['Views']> =
  PublicSchema['Views'][T]['Row']

export type Enums<T extends keyof PublicSchema['Enums']> =
  PublicSchema['Enums'][T]
