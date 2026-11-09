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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          athlete_id: string
          id: string
          program_id: string | null
          template_id: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          athlete_id: string
          id?: string
          program_id?: string | null
          template_id?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          athlete_id?: string
          id?: string
          program_id?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_exercise_settings: {
        Row: {
          athlete_id: string
          exercise_id: string
          rest_s: number | null
          setup_notes: string | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          exercise_id: string
          rest_s?: number | null
          setup_notes?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          exercise_id?: string
          rest_s?: number | null
          setup_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_exercise_settings_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_exercise_settings_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      athletes: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athletes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athletes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      body_measurements: {
        Row: {
          arm_cm: number | null
          athlete_id: string
          body_fat_pct: number | null
          chest_cm: number | null
          created_at: string
          created_by: string | null
          hips_cm: number | null
          id: string
          measured_at: string
          notes: string | null
          thigh_cm: number | null
          waist_cm: number | null
          weight_kg: number | null
        }
        Insert: {
          arm_cm?: number | null
          athlete_id: string
          body_fat_pct?: number | null
          chest_cm?: number | null
          created_at?: string
          created_by?: string | null
          hips_cm?: number | null
          id?: string
          measured_at?: string
          notes?: string | null
          thigh_cm?: number | null
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Update: {
          arm_cm?: number | null
          athlete_id?: string
          body_fat_pct?: number | null
          chest_cm?: number | null
          created_at?: string
          created_by?: string | null
          hips_cm?: number | null
          id?: string
          measured_at?: string
          notes?: string | null
          thigh_cm?: number | null
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "body_measurements_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_measurements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          archived_at: string | null
          created_at: string
          default_rest_s: number
          description: string | null
          equipment: Database["public"]["Enums"]["equipment_type"]
          id: string
          muscle_group: Database["public"]["Enums"]["muscle_group"]
          name: string
          owner_id: string | null
          slug: string | null
          video_url: string | null
          weight_step_kg: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          default_rest_s?: number
          description?: string | null
          equipment: Database["public"]["Enums"]["equipment_type"]
          id?: string
          muscle_group: Database["public"]["Enums"]["muscle_group"]
          name: string
          owner_id?: string | null
          slug?: string | null
          video_url?: string | null
          weight_step_kg?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          default_rest_s?: number
          description?: string | null
          equipment?: Database["public"]["Enums"]["equipment_type"]
          id?: string
          muscle_group?: Database["public"]["Enums"]["muscle_group"]
          name?: string
          owner_id?: string | null
          slug?: string | null
          video_url?: string | null
          weight_step_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "exercises_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          athlete_id: string | null
          code: string
          created_at: string
          expires_at: string
          trainer_id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          athlete_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          trainer_id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          athlete_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          trainer_id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          athlete_id: string
          created_at: string
          created_by: string | null
          ends_on: string | null
          id: string
          kind: Database["public"]["Enums"]["membership_kind"]
          notes: string | null
          paid_on: string | null
          sessions_total: number | null
          starts_on: string
          title: string | null
          trainer_id: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          kind: Database["public"]["Enums"]["membership_kind"]
          notes?: string | null
          paid_on?: string | null
          sessions_total?: number | null
          starts_on?: string
          title?: string | null
          trainer_id?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["membership_kind"]
          notes?: string | null
          paid_on?: string | null
          sessions_total?: number | null
          starts_on?: string
          title?: string | null
          trainer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_cells: {
        Row: {
          plan_row_id: string
          sets: Json
          week: number
        }
        Insert: {
          plan_row_id: string
          sets: Json
          week: number
        }
        Update: {
          plan_row_id?: string
          sets?: Json
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_cells_plan_row_id_fkey"
            columns: ["plan_row_id"]
            isOneToOne: false
            referencedRelation: "plan_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          plan_id: string
          plan_row_id: string | null
          week: number | null
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          id?: string
          plan_id: string
          plan_row_id?: string | null
          week?: number | null
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          plan_id?: string
          plan_row_id?: string | null
          week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_comments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_comments_plan_row_id_fkey"
            columns: ["plan_row_id"]
            isOneToOne: false
            referencedRelation: "plan_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_days: {
        Row: {
          id: string
          name: string
          plan_id: string
          position: number
        }
        Insert: {
          id?: string
          name?: string
          plan_id: string
          position: number
        }
        Update: {
          id?: string
          name?: string
          plan_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_days_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_rows: {
        Row: {
          exercise_id: string
          id: string
          notes: string | null
          plan_day_id: string
          position: number
          rest_s: number | null
        }
        Insert: {
          exercise_id: string
          id?: string
          notes?: string | null
          plan_day_id: string
          position: number
          rest_s?: number | null
        }
        Update: {
          exercise_id?: string
          id?: string
          notes?: string | null
          plan_day_id?: string
          position?: number
          rest_s?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_rows_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_rows_plan_day_id_fkey"
            columns: ["plan_day_id"]
            isOneToOne: false
            referencedRelation: "plan_days"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          archived_at: string | null
          athlete_id: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          owner_id: string
          source_plan_id: string | null
          updated_at: string
          weeks: number
        }
        Insert: {
          archived_at?: string | null
          athlete_id?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          owner_id?: string
          source_plan_id?: string | null
          updated_at?: string
          weeks?: number
        }
        Update: {
          archived_at?: string | null
          athlete_id?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          source_plan_id?: string | null
          updated_at?: string
          weeks?: number
        }
        Relationships: [
          {
            foreignKeyName: "plans_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_source_plan_id_fkey"
            columns: ["source_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          can_be_trainer: boolean
          created_at: string
          display_name: string
          feedback_seen_at: string | null
          id: string
          is_admin: boolean
          is_trainer: boolean
          locale: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          can_be_trainer?: boolean
          created_at?: string
          display_name?: string
          feedback_seen_at?: string | null
          id: string
          is_admin?: boolean
          is_trainer?: boolean
          locale?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          can_be_trainer?: boolean
          created_at?: string
          display_name?: string
          feedback_seen_at?: string | null
          id?: string
          is_admin?: boolean
          is_trainer?: boolean
          locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      program_templates: {
        Row: {
          position: number
          program_id: string
          template_id: string
        }
        Insert: {
          position: number
          program_id: string
          template_id: string
        }
        Update: {
          position?: number
          program_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_templates_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          owner_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sets: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          is_warmup: boolean
          position: number
          reps: number
          rpe: number | null
          weight_kg: number
          workout_exercise_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_warmup?: boolean
          position: number
          reps?: number
          rpe?: number | null
          weight_kg?: number
          workout_exercise_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_warmup?: boolean
          position?: number
          reps?: number
          rpe?: number | null
          weight_kg?: number
          workout_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sets_workout_exercise_id_fkey"
            columns: ["workout_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      template_exercises: {
        Row: {
          exercise_id: string
          id: string
          notes: string | null
          position: number
          rest_s: number | null
          sets: Json | null
          target_reps_max: number | null
          target_reps_min: number | null
          target_sets: number
          target_weight_kg: number | null
          template_id: string
        }
        Insert: {
          exercise_id: string
          id?: string
          notes?: string | null
          position: number
          rest_s?: number | null
          sets?: Json | null
          target_reps_max?: number | null
          target_reps_min?: number | null
          target_sets?: number
          target_weight_kg?: number | null
          template_id: string
        }
        Update: {
          exercise_id?: string
          id?: string
          notes?: string | null
          position?: number
          rest_s?: number | null
          sets?: Json | null
          target_reps_max?: number | null
          target_reps_min?: number | null
          target_sets?: number
          target_weight_kg?: number | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_exercises_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          owner_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_athletes: {
        Row: {
          athlete_id: string
          created_at: string
          trainer_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          trainer_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_athletes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_athletes_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          workout_id: string
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          id?: string
          workout_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_comments_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workout_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_comments_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_exercises: {
        Row: {
          athlete_feedback: string | null
          difficulty: number | null
          exercise_id: string
          feedback_at: string | null
          feedback_by: string | null
          id: string
          notes: string | null
          plan_row_id: string | null
          position: number
          workout_id: string
        }
        Insert: {
          athlete_feedback?: string | null
          difficulty?: number | null
          exercise_id: string
          feedback_at?: string | null
          feedback_by?: string | null
          id?: string
          notes?: string | null
          plan_row_id?: string | null
          position: number
          workout_id: string
        }
        Update: {
          athlete_feedback?: string | null
          difficulty?: number | null
          exercise_id?: string
          feedback_at?: string | null
          feedback_by?: string | null
          id?: string
          notes?: string | null
          plan_row_id?: string | null
          position?: number
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercises_feedback_by_fkey"
            columns: ["feedback_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercises_plan_row_id_fkey"
            columns: ["plan_row_id"]
            isOneToOne: false
            referencedRelation: "plan_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercises_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workout_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercises_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          athlete_id: string
          created_at: string
          created_by: string | null
          finished_at: string | null
          id: string
          membership_id: string | null
          notes: string | null
          plan_day_id: string | null
          plan_id: string | null
          plan_week: number | null
          program_id: string | null
          started_at: string
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          membership_id?: string | null
          notes?: string | null
          plan_day_id?: string | null
          plan_id?: string | null
          plan_week?: number | null
          program_id?: string | null
          started_at?: string
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          membership_id?: string | null
          notes?: string | null
          plan_day_id?: string | null
          plan_id?: string | null
          plan_week?: number | null
          program_id?: string | null
          started_at?: string
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workouts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "membership_usage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_plan_day_id_fkey"
            columns: ["plan_day_id"]
            isOneToOne: false
            referencedRelation: "plan_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      membership_usage: {
        Row: {
          athlete_id: string | null
          created_at: string | null
          created_by: string | null
          ends_on: string | null
          id: string | null
          kind: Database["public"]["Enums"]["membership_kind"] | null
          notes: string | null
          paid_on: string | null
          sessions_total: number | null
          sessions_used: number | null
          starts_on: string | null
          title: string | null
          trainer_id: string | null
        }
        Insert: {
          athlete_id?: string | null
          created_at?: string | null
          created_by?: string | null
          ends_on?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["membership_kind"] | null
          notes?: string | null
          paid_on?: string | null
          sessions_total?: number | null
          sessions_used?: never
          starts_on?: string | null
          title?: string | null
          trainer_id?: string | null
        }
        Update: {
          athlete_id?: string | null
          created_at?: string | null
          created_by?: string | null
          ends_on?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["membership_kind"] | null
          notes?: string | null
          paid_on?: string | null
          sessions_total?: number | null
          sessions_used?: never
          starts_on?: string | null
          title?: string | null
          trainer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      template_usage: {
        Row: {
          athlete_id: string | null
          last_used_at: string | null
          template_id: string | null
          times_used: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workouts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_summaries: {
        Row: {
          athlete_id: string | null
          created_by: string | null
          exercise_count: number | null
          finished_at: string | null
          id: string | null
          membership_id: string | null
          set_count: number | null
          started_at: string | null
          template_id: string | null
          title: string | null
          volume_kg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workouts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "membership_usage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_athlete_workouts: {
        Args: { p_athlete: string; p_limit?: number }
        Returns: {
          exercise_count: number
          finished_at: string
          id: string
          membership_id: string
          set_count: number
          started_at: string
          title: string
          volume_kg: number
        }[]
      }
      admin_set_can_be_trainer: {
        Args: { p_allowed: boolean; p_user: string }
        Returns: undefined
      }
      admin_trainer_clients: {
        Args: { p_trainer: string }
        Returns: {
          athlete_id: string
          avatar_url: string
          display_name: string
          has_account: boolean
          last_workout_at: string
          linked_at: string
          workouts_count: number
        }[]
      }
      admin_users: {
        Args: never
        Returns: {
          avatar_url: string
          can_be_trainer: boolean
          clients_count: number
          created_at: string
          display_name: string
          id: string
          is_admin: boolean
          is_trainer: boolean
        }[]
      }
      admin_workout: { Args: { p_workout: string }; Returns: Json }
      claim_invite: { Args: { p_code: string }; Returns: string }
      copy_plan: {
        Args: { p_athlete: string; p_name?: string; p_source: string }
        Returns: string
      }
      create_offline_client: {
        Args: { p_display_name: string }
        Returns: string
      }
      create_plan_from_templates: {
        Args: {
          p_athlete: string
          p_name: string
          p_template_ids: string[]
          p_weeks: number
        }
        Returns: string
      }
      exercise_records: {
        Args: { p_athlete: string; p_exclude_workout?: string }
        Returns: {
          best_e1rm_kg: number
          best_reps: number
          best_set_volume_kg: number
          best_weight_kg: number
          exercise_id: string
          last_performed_at: string
          workouts_count: number
        }[]
      }
      get_invite: {
        Args: { p_code: string }
        Returns: {
          athlete_name: string
          status: string
          trainer_avatar_url: string
          trainer_name: string
        }[]
      }
      last_performance: {
        Args: {
          p_athlete: string
          p_exclude_workout?: string
          p_exercise: string
        }
        Returns: {
          is_warmup: boolean
          performed_at: string
          position: number
          reps: number
          weight_kg: number
          workout_id: string
        }[]
      }
      next_plan_slot: {
        Args: { p_plan: string }
        Returns: {
          plan_day_id: string
          week: number
        }[]
      }
      next_program_template: {
        Args: { p_athlete: string; p_program: string }
        Returns: string
      }
      save_plan: {
        Args: {
          p_athlete: string
          p_days: Json
          p_id: string
          p_name: string
          p_notes: string
          p_weeks: number
        }
        Returns: string
      }
      save_program: {
        Args: { p_id: string; p_name: string; p_template_ids: string[] }
        Returns: string
      }
      save_template: {
        Args: { p_id: string; p_items: Json; p_name: string; p_notes: string }
        Returns: string
      }
      start_workout_from_plan: {
        Args: {
          p_day: string
          p_membership?: string
          p_plan: string
          p_week: number
        }
        Returns: string
      }
      start_workout_from_template: {
        Args: {
          p_athlete: string
          p_membership?: string
          p_program?: string
          p_template: string
        }
        Returns: string
      }
      trainer_clients_overview: {
        Args: never
        Returns: {
          athlete_id: string
          avatar_url: string
          display_name: string
          has_account: boolean
          last_workout_at: string
          last_workout_id: string
          last_workout_title: string
          linked_at: string
        }[]
      }
      trainer_feedback_feed: {
        Args: { p_limit?: number }
        Returns: {
          athlete_id: string
          athlete_name: string
          author_name: string
          body: string
          created_at: string
          difficulty: number
          exercise_id: string
          kind: string
          plan_id: string
          plan_row_id: string
          week: number
          workout_id: string
        }[]
      }
    }
    Enums: {
      equipment_type:
        | "machine"
        | "barbell"
        | "dumbbell"
        | "cable"
        | "bodyweight"
        | "other"
      membership_kind: "trainer" | "gym"
      muscle_group:
        | "chest"
        | "back"
        | "shoulders"
        | "biceps"
        | "triceps"
        | "legs"
        | "glutes"
        | "calves"
        | "core"
        | "full_body"
        | "other"
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
      equipment_type: [
        "machine",
        "barbell",
        "dumbbell",
        "cable",
        "bodyweight",
        "other",
      ],
      membership_kind: ["trainer", "gym"],
      muscle_group: [
        "chest",
        "back",
        "shoulders",
        "biceps",
        "triceps",
        "legs",
        "glutes",
        "calves",
        "core",
        "full_body",
        "other",
      ],
    },
  },
} as const
