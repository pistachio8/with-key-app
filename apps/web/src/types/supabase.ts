export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      action_logs: {
        Row: {
          activity_type: string;
          ai_summary: string;
          auto_verify_model_version: string | null;
          auto_verify_score: number | null;
          auto_verify_status: string;
          challenge_id: string;
          created_at: string;
          edited_at: string | null;
          id: string;
          memo: string | null;
          photo_captured_at: string | null;
          photo_path: string | null;
          photo_phash: string | null;
          prompt_version: string;
          regenerate_count: number;
          reroll_count: number;
          selected_keywords: string[];
          shown_keywords: string[];
          template_fallback: boolean;
          user_id: string;
        };
        Insert: {
          activity_type: string;
          ai_summary: string;
          auto_verify_model_version?: string | null;
          auto_verify_score?: number | null;
          auto_verify_status?: string;
          challenge_id: string;
          created_at?: string;
          edited_at?: string | null;
          id?: string;
          memo?: string | null;
          photo_captured_at?: string | null;
          photo_path?: string | null;
          photo_phash?: string | null;
          prompt_version: string;
          regenerate_count?: number;
          reroll_count?: number;
          selected_keywords: string[];
          shown_keywords: string[];
          template_fallback?: boolean;
          user_id: string;
        };
        Update: {
          activity_type?: string;
          ai_summary?: string;
          auto_verify_model_version?: string | null;
          auto_verify_score?: number | null;
          auto_verify_status?: string;
          challenge_id?: string;
          created_at?: string;
          edited_at?: string | null;
          id?: string;
          memo?: string | null;
          photo_captured_at?: string | null;
          photo_path?: string | null;
          photo_phash?: string | null;
          prompt_version?: string;
          regenerate_count?: number;
          reroll_count?: number;
          selected_keywords?: string[];
          shown_keywords?: string[];
          template_fallback?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_logs_challenge_id_fkey";
            columns: ["challenge_id"];
            isOneToOne: false;
            referencedRelation: "challenges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_cost_log: {
        Row: {
          month: string;
          scope: string;
          total_micros: number;
          updated_at: string;
        };
        Insert: {
          month: string;
          scope: string;
          total_micros?: number;
          updated_at?: string;
        };
        Update: {
          month?: string;
          scope?: string;
          total_micros?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      challenge_participants: {
        Row: {
          challenge_id: string;
          deposit_points: number;
          joined_at: string;
          signed_at: string | null;
          user_id: string;
        };
        Insert: {
          challenge_id: string;
          deposit_points?: number;
          joined_at?: string;
          signed_at?: string | null;
          user_id: string;
        };
        Update: {
          challenge_id?: string;
          deposit_points?: number;
          joined_at?: string;
          signed_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "challenge_participants_challenge_id_fkey";
            columns: ["challenge_id"];
            isOneToOne: false;
            referencedRelation: "challenges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "challenge_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      challenges: {
        Row: {
          closed_at: string | null;
          created_at: string;
          duration_days: number;
          end_at: string | null;
          goal_count: number;
          group_id: string;
          id: string;
          penalty_amount: number;
          start_at: string | null;
          start_nudge_sent_at: string | null;
          status: string;
          title: string;
          type: string;
          visibility_version: number;
        };
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          duration_days?: number;
          end_at?: string | null;
          goal_count?: number;
          group_id: string;
          id?: string;
          penalty_amount: number;
          start_at?: string | null;
          start_nudge_sent_at?: string | null;
          status?: string;
          title: string;
          type?: string;
          visibility_version?: number;
        };
        Update: {
          closed_at?: string | null;
          created_at?: string;
          duration_days?: number;
          end_at?: string | null;
          goal_count?: number;
          group_id?: string;
          id?: string;
          penalty_amount?: number;
          start_at?: string | null;
          start_nudge_sent_at?: string | null;
          status?: string;
          title?: string;
          type?: string;
          visibility_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "challenges_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          created_at: string;
          id: number;
          name: string;
          props: Json;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: never;
          name: string;
          props?: Json;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: never;
          name?: string;
          props?: Json;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      group_members: {
        Row: {
          group_id: string;
          joined_at: string;
          role: string;
          user_id: string;
        };
        Insert: {
          group_id: string;
          joined_at?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          group_id?: string;
          joined_at?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      groups: {
        Row: {
          account_holder: string | null;
          account_number_encrypted: string | null;
          account_number_last4: string | null;
          bank_code: string | null;
          created_at: string;
          disbanded_at: string | null;
          id: string;
          name: string | null;
          owner_id: string;
          status: string;
        };
        Insert: {
          account_holder?: string | null;
          account_number_encrypted?: string | null;
          account_number_last4?: string | null;
          bank_code?: string | null;
          created_at?: string;
          disbanded_at?: string | null;
          id?: string;
          name?: string | null;
          owner_id: string;
          status?: string;
        };
        Update: {
          account_holder?: string | null;
          account_number_encrypted?: string | null;
          account_number_last4?: string | null;
          bank_code?: string | null;
          created_at?: string;
          disbanded_at?: string | null;
          id?: string;
          name?: string | null;
          owner_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      invites: {
        Row: {
          created_at: string;
          created_by: string;
          expires_at: string;
          group_id: string;
          id: string;
          token: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          expires_at?: string;
          group_id: string;
          id?: string;
          token: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          group_id?: string;
          id?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      kudos: {
        Row: {
          action_log_id: string;
          created_at: string;
          emoji: string;
          id: string;
          user_id: string;
        };
        Insert: {
          action_log_id: string;
          created_at?: string;
          emoji: string;
          id?: string;
          user_id: string;
        };
        Update: {
          action_log_id?: string;
          created_at?: string;
          emoji?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kudos_action_log_id_fkey";
            columns: ["action_log_id"];
            isOneToOne: false;
            referencedRelation: "action_logs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kudos_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      kudos_push_log: {
        Row: {
          action_log_id: string;
          actor_user_id: string;
          recipient_user_id: string;
          sent_at: string;
        };
        Insert: {
          action_log_id: string;
          actor_user_id: string;
          recipient_user_id: string;
          sent_at?: string;
        };
        Update: {
          action_log_id?: string;
          actor_user_id?: string;
          recipient_user_id?: string;
          sent_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kudos_push_log_action_log_id_fkey";
            columns: ["action_log_id"];
            isOneToOne: false;
            referencedRelation: "action_logs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kudos_push_log_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kudos_push_log_recipient_user_id_fkey";
            columns: ["recipient_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      point_ledger: {
        Row: {
          challenge_id: string | null;
          created_at: string;
          delta: number;
          group_id: string;
          id: string;
          reason: string;
          ref_id: string | null;
          user_id: string;
        };
        Insert: {
          challenge_id?: string | null;
          created_at?: string;
          delta: number;
          group_id: string;
          id?: string;
          reason: string;
          ref_id?: string | null;
          user_id: string;
        };
        Update: {
          challenge_id?: string | null;
          created_at?: string;
          delta?: number;
          group_id?: string;
          id?: string;
          reason?: string;
          ref_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "point_ledger_challenge_id_fkey";
            columns: ["challenge_id"];
            isOneToOne: false;
            referencedRelation: "challenges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_ledger_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_ledger_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      settlements: {
        Row: {
          challenge_id: string;
          distribution: Json;
          pool_points: number;
          settled_at: string;
          settled_by: string;
        };
        Insert: {
          challenge_id: string;
          distribution?: Json;
          pool_points: number;
          settled_at?: string;
          settled_by: string;
        };
        Update: {
          challenge_id?: string;
          distribution?: Json;
          pool_points?: number;
          settled_at?: string;
          settled_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "settlements_challenge_id_fkey";
            columns: ["challenge_id"];
            isOneToOne: true;
            referencedRelation: "challenges";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          id: string;
          last_feed_seen_at: string | null;
          notification_prefs: Json;
          onboarded_at: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          last_feed_seen_at?: string | null;
          notification_prefs?: Json;
          onboarded_at?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          last_feed_seen_at?: string | null;
          notification_prefs?: Json;
          onboarded_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _settlement_confirmed_penalties: {
        Args: { p_challenge_id: string };
        Returns: {
          confirmed_penalty: number;
          user_id: string;
        }[];
      };
      accept_invite: { Args: { p_token: string }; Returns: string };
      add_ai_cost: {
        Args: { p_micros: number; p_scope: string };
        Returns: number;
      };
      audit_rls_status: {
        Args: never;
        Returns: {
          rowsecurity: boolean;
          tablename: string;
        }[];
      };
      create_challenge: {
        Args: {
          p_duration_days: number;
          p_goal_count: number;
          p_group_id: string;
          p_penalty_amount: number;
          p_title: string;
          p_type: string;
        };
        Returns: {
          id: string;
          participant_count: number;
        }[];
      };
      create_group_with_owner: {
        Args: {
          p_account_holder: string;
          p_account_number_encrypted: string;
          p_account_number_last4: string;
          p_bank_code: string;
          p_name: string;
        };
        Returns: string;
      };
      deposit_release: {
        Args: { p_challenge_id: string; p_user_id: string };
        Returns: undefined;
      };
      distribute_pool: { Args: { p_challenge_id: string }; Returns: number };
      grant_bundle_points: {
        Args: {
          p_amount: number;
          p_group_id: string;
          p_ref_id: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      hold_deposit: {
        Args: { p_amount: number; p_challenge_id: string };
        Returns: undefined;
      };
      is_group_member: { Args: { gid: string }; Returns: boolean };
      is_group_owner: { Args: { gid: string }; Returns: boolean };
      point_balance: {
        Args: { p_group_id: string; p_user_id: string };
        Returns: number;
      };
      reenable_on_auth_user_created: { Args: never; Returns: undefined };
      settle_challenge: { Args: { p_challenge_id: string }; Returns: undefined };
      sign_and_maybe_activate: {
        Args: { p_challenge_id: string };
        Returns: {
          challenge_created_at: string;
          end_at: string;
          owner_user_id: string;
          participant_count: number;
          should_nudge_owner: boolean;
          signed_count: number;
          start_at: string;
          status: string;
        }[];
      };
      start_challenge_with_signed_participants: {
        Args: { p_challenge_id: string };
        Returns: {
          challenge_created_at: string;
          end_at: string;
          participant_count: number;
          start_at: string;
          status: string;
        }[];
      };
      truncate_test_data: { Args: never; Returns: undefined };
      update_action_log_photo_path: {
        Args: { p_log_id: string; p_photo_path: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
