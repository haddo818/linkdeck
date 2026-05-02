export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          name: string;
          email: string;
          profile_image_url: string | null;
          auth_provider: string;
          theme_preference: string;
          created_at: string;
        };
        Insert: {
          id: string;
          name?: string;
          email?: string;
          profile_image_url?: string | null;
          auth_provider?: string;
          theme_preference?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          profile_image_url?: string | null;
          auth_provider?: string;
          theme_preference?: string;
          created_at?: string;
        };
      };
      teams: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          created_at: string;
          created_by: string;
        };
        Insert: {
          id?: string;
          name: string;
          invite_code: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          created_at?: string;
          created_by?: string;
        };
      };
      team_members: {
        Row: {
          team_id: string;
          user_id: string;
          role: string;
        };
        Insert: {
          team_id: string;
          user_id: string;
          role?: string;
        };
        Update: {
          team_id?: string;
          user_id?: string;
          role?: string;
        };
      };
      boards: {
        Row: {
          id: string;
          name: string;
          color: string;
          layout_config: Json;
          owner_id: string | null;
          team_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          color?: string;
          layout_config?: Json;
          owner_id?: string | null;
          team_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          color?: string;
          layout_config?: Json;
          owner_id?: string | null;
          team_id?: string | null;
          created_at?: string;
        };
      };
      links: {
        Row: {
          id: string;
          board_id: string;
          created_by: string;
          url: string;
          title: string | null;
          memo: string | null;
          display_type: string;
          status: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          board_id: string;
          created_by: string;
          url: string;
          title?: string | null;
          memo?: string | null;
          display_type?: string;
          status?: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          board_id?: string;
          created_by?: string;
          url?: string;
          title?: string | null;
          memo?: string | null;
          display_type?: string;
          status?: string;
          sort_order?: number;
          created_at?: string;
        };
      };
    };
    Functions: {
      join_team_with_invite: {
        Args: { p_invite_code: string };
        Returns: string;
      };
      sync_auth_user_profile: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
  };
}
