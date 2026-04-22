// Hand-written Database type for Supabase client inference.
// Regenerate with: npx supabase gen types typescript --project-id <id>
// after running migrations, then replace this file with the output.

export type BlockType = 'text' | 'divider'
export type BlockTagSource = 'inline' | 'picker'

export type Database = {
  public: {
    Tables: {
      folders: {
        Row: {
          id: string
          user_id: string
          parent_id: string | null
          name: string
          position: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          parent_id?: string | null
          name: string
          position: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          parent_id?: string | null
          name?: string
          position?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          id: string
          user_id: string
          folder_id: string
          name: string
          position: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          folder_id: string
          name: string
          position: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          folder_id?: string
          name?: string
          position?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          id: string
          user_id: string
          conversation_id: string
          type: BlockType
          body: string | null
          position: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          conversation_id: string
          type?: BlockType
          body?: string | null
          position: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          conversation_id?: string
          type?: BlockType
          body?: string | null
          position?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string | null
          created_at?: string
        }
        Relationships: []
      }
      block_tags: {
        Row: {
          block_id: string
          tag_id: string
          source: BlockTagSource
          created_at: string
        }
        Insert: {
          block_id: string
          tag_id: string
          source: BlockTagSource
          created_at?: string
        }
        Update: {
          block_id?: string
          tag_id?: string
          source?: BlockTagSource
          created_at?: string
        }
        Relationships: []
      }
      block_references: {
        Row: {
          id: string
          source_block_id: string
          target_block_id: string
          created_at: string
        }
        Insert: {
          id?: string
          source_block_id: string
          target_block_id: string
          created_at?: string
        }
        Update: {
          id?: string
          source_block_id?: string
          target_block_id?: string
          created_at?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          user_id: string
          preferences: Record<string, unknown>
          updated_at: string
        }
        Insert: {
          user_id: string
          preferences?: Record<string, unknown>
          updated_at?: string
        }
        Update: {
          user_id?: string
          preferences?: Record<string, unknown>
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      block_type: BlockType
      block_tag_source: BlockTagSource
    }
  }
}
