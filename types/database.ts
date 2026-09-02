// =============================================================================
// Tipi generati manualmente a partire dallo schema in supabase/migrations/.
// =============================================================================
// NOTA PER CHI RIPRENDE QUESTO FILE: in questo ambiente di sviluppo non è
// stato possibile avviare Supabase in locale (`supabase start` richiede
// Docker, non disponibile in questo sandbox) né collegarsi a un progetto
// cloud (non ancora creato dall'utente). Questo file è stato scritto a mano
// per essere strutturalmente identico all'output di:
//
//   supabase gen types typescript --local > types/database.ts
//   # oppure, con un progetto cloud collegato:
//   supabase gen types typescript --project-id <ref> > types/database.ts
//
// Quando un ambiente Supabase reale (locale con Docker, o cloud) sarà
// disponibile, rigenerare questo file con il comando sopra e sostituirlo:
// la forma (Database / Tables / Enums / Functions) è la stessa, quindi
// lib/supabase/*.ts continuerà a funzionare senza modifiche.
// =============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type EventCategory = "personale" | "coppia" | "speciale" | "ciclo";
// 'mensile' aggiunto in supabase/migrations/
// 20260901070000_monthly_anniversary_and_recurrence.sql per il mesiversario.
export type EventRecurrence = "nessuna" | "annuale" | "mensile";
export type PairingInviteStatus =
  | "pending"
  | "accepted"
  | "expired"
  | "cancelled";
export type MessageType = "text" | "photo" | "reminder";
export type AppointmentStatus = "idea" | "confermato";
export type WishlistCategory = "regalo" | "attivita";
export type WishlistTarget = "self" | "partner" | "entrambi";
export type WishlistPriority = "bassa" | "media" | "alta";
export type WishlistStatus = "attivo" | "completato";
export type NotificationType =
  | "reazione"
  | "evento_coppia"
  | "appuntamento"
  | "wishlist"
  | "quiz"
  | "mood_checkin";
export type MoodType = "felice" | "sereno" | "stanco" | "stressato" | "triste" | "innamorato";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          color: string;
          couple_id: string | null;
          // Data di nascita, impostabile dal Profilo (nullable: non
          // richiesta alla registrazione). Vedi supabase/migrations/
          // 20260901060000_profile_birth_date_and_special_events.sql.
          birth_date: string | null;
          // FK verso l'evento calendario "Compleanno" (categoria speciale)
          // generato/aggiornato automaticamente dal trigger
          // handle_profile_birthday_event. MAI impostabile dal client
          // (assente da Update, stesso trattamento di couple_id).
          birthday_event_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          // Le righe profiles vengono create solo dal trigger
          // handle_new_user su auth.users: non c'è un INSERT diretto
          // consentito dal client (nessuna policy RLS lo permette).
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          color?: string;
          couple_id?: string | null;
          birth_date?: string | null;
          birthday_event_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string | null;
          avatar_url?: string | null;
          color?: string;
          // couple_id non è aggiornabile dal client: viene scritto solo
          // dalla funzione RPC accept_pairing_invite.
          // birth_date SÌ è aggiornabile dal client (RLS profiles_update_self
          // lo permette già, vedi lib/profile-actions.ts).
          birth_date?: string | null;
          // birthday_event_id NO: scritto solo dal trigger
          // handle_profile_birthday_event (SECURITY DEFINER), mai dal client.
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_couple_id_fkey";
            columns: ["couple_id"];
            isOneToOne: false;
            referencedRelation: "couples";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_birthday_event_id_fkey";
            columns: ["birthday_event_id"];
            isOneToOne: true;
            referencedRelation: "calendar_events";
            referencedColumns: ["id"];
          },
        ];
      };
      couples: {
        Row: {
          id: string;
          partner_1_id: string;
          partner_2_id: string;
          relationship_start_date: string | null;
          // FK verso l'evento calendario "Anniversario" (categoria speciale)
          // generato/aggiornato automaticamente dal trigger
          // handle_couple_anniversary_event quando relationship_start_date
          // cambia (via RPC set_relationship_start_date). Vedi
          // supabase/migrations/20260901060000_profile_birth_date_and_special_events.sql.
          anniversary_event_id: string | null;
          // FK verso l'evento calendario "Mesiversario" (categoria speciale,
          // ricorrenza mensile) generato/aggiornato automaticamente dallo
          // stesso trigger handle_couple_anniversary_event, esteso in
          // supabase/migrations/20260901070100_monthly_anniversary_and_recurrence_part2.sql.
          monthly_anniversary_event_id: string | null;
          // Toggle di coppia (non del singolo utente), scrivibili solo via
          // RPC set_quiz_enabled/set_mood_checkin_enabled — vedi
          // supabase/migrations/20260904000000_couple_feature_toggles_and_quiz_v2.sql.
          quiz_enabled: boolean;
          mood_checkin_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // Solo via RPC accept_pairing_invite, nessun INSERT client diretto.
        Update: never; // Nessuna policy UPDATE per `authenticated` in questa fase — relationship_start_date/quiz_enabled/mood_checkin_enabled passano dalle rispettive RPC, anniversary_event_id/monthly_anniversary_event_id mai dal client.
        Relationships: [
          {
            foreignKeyName: "couples_partner_1_id_fkey";
            columns: ["partner_1_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "couples_partner_2_id_fkey";
            columns: ["partner_2_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "couples_anniversary_event_id_fkey";
            columns: ["anniversary_event_id"];
            isOneToOne: true;
            referencedRelation: "calendar_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "couples_monthly_anniversary_event_id_fkey";
            columns: ["monthly_anniversary_event_id"];
            isOneToOne: true;
            referencedRelation: "calendar_events";
            referencedColumns: ["id"];
          },
        ];
      };
      pairing_invites: {
        Row: {
          id: string;
          code: string;
          created_by: string;
          status: PairingInviteStatus;
          accepted_by: string | null;
          accepted_at: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: never; // Solo via RPC create_pairing_invite.
        Update: never; // Solo via RPC accept_pairing_invite.
        Relationships: [
          {
            foreignKeyName: "pairing_invites_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pairing_invites_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_events: {
        Row: {
          id: string;
          couple_id: string;
          created_by: string;
          title: string;
          tag: string | null;
          notes: string | null;
          category: EventCategory;
          starts_at: string;
          ends_at: string | null;
          all_day: boolean;
          recurrence: EventRecurrence;
          is_shared_with_partner: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          created_by: string;
          title: string;
          tag?: string | null;
          notes?: string | null;
          category?: EventCategory;
          starts_at: string;
          ends_at?: string | null;
          all_day?: boolean;
          recurrence?: EventRecurrence;
          is_shared_with_partner?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          tag?: string | null;
          notes?: string | null;
          category?: EventCategory;
          starts_at?: string;
          ends_at?: string | null;
          all_day?: boolean;
          recurrence?: EventRecurrence;
          is_shared_with_partner?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_events_couple_id_fkey";
            columns: ["couple_id"];
            isOneToOne: false;
            referencedRelation: "couples";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_events_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          couple_id: string;
          sender_id: string;
          type: MessageType;
          content: string;
          photo_url: string | null;
          scheduled_for: string | null;
          liked_by: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          sender_id: string;
          type?: MessageType;
          content: string;
          photo_url?: string | null;
          scheduled_for?: string | null;
          // liked_by non è impostabile via INSERT: default '{}', si scrive
          // solo tramite la RPC toggle_message_reaction.
          created_at?: string;
        };
        // Nessun UPDATE diretto dal client: content/liked_by si modificano
        // solo tramite la RPC toggle_message_reaction (vedi RLS).
        Update: never;
        Relationships: [
          {
            foreignKeyName: "messages_couple_id_fkey";
            columns: ["couple_id"];
            isOneToOne: false;
            referencedRelation: "couples";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          id: string;
          couple_id: string;
          created_by: string;
          title: string;
          location: string | null;
          cost: number | null;
          notes: string | null;
          photo_url: string | null;
          tag: string | null;
          status: AppointmentStatus;
          // NULL per le "idee", valorizzato quando status = 'confermato'
          // (vincolo DB, non solo convenzione). Vedi
          // supabase/migrations/20260901010000_appointments.sql.
          calendar_event_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          created_by: string;
          title: string;
          location?: string | null;
          cost?: number | null;
          notes?: string | null;
          photo_url?: string | null;
          tag?: string | null;
          // Default 'idea' lato DB. Se si inserisce già 'confermato',
          // calendar_event_id è obbligatorio nella stessa insert (vincolo
          // appointments_status_calendar_event_consistency) — ma il flusso
          // normale (vedi lib/appointments-actions.ts) inserisce come 'idea'
          // e poi fa un UPDATE separato per confermare.
          status?: AppointmentStatus;
          calendar_event_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          location?: string | null;
          cost?: number | null;
          notes?: string | null;
          photo_url?: string | null;
          tag?: string | null;
          status?: AppointmentStatus;
          calendar_event_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_couple_id_fkey";
            columns: ["couple_id"];
            isOneToOne: false;
            referencedRelation: "couples";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_calendar_event_id_fkey";
            columns: ["calendar_event_id"];
            isOneToOne: true;
            referencedRelation: "calendar_events";
            referencedColumns: ["id"];
          },
        ];
      };
      wishlist_items: {
        // Tabella base — scritture (insert/update) SEMPRE qui. Per la
        // LETTURA della lista condivisa usare la view `wishlist_feed` sotto
        // (maschera i campi sensibili delle sorprese attive non tue), non
        // questa tabella direttamente: la RLS di questa tabella nega del
        // tutto quelle righe a chi non è il creatore, quindi una query
        // diretta le ometterebbe silenziosamente dalla lista invece di
        // mostrare un placeholder "sorpresa in arrivo". Vedi
        // supabase/migrations/20260901020000_wishlist_items.sql per
        // l'analisi completa.
        Row: {
          id: string;
          couple_id: string;
          created_by: string;
          category: WishlistCategory;
          target: WishlistTarget;
          title: string;
          description: string | null;
          price: number | null;
          link: string | null;
          photo_url: string | null;
          priority: WishlistPriority;
          is_surprise: boolean;
          status: WishlistStatus;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          updated_at: string;
          // Collegamento opzionale a un evento calendario — vedi
          // supabase/migrations/20260904020000_wishlist_linked_event_and_surprise_notify.sql.
          linked_calendar_event_id: string | null;
        };
        Insert: {
          id?: string;
          couple_id: string;
          created_by: string;
          category: WishlistCategory;
          target: WishlistTarget;
          title: string;
          description?: string | null;
          price?: number | null;
          link?: string | null;
          photo_url?: string | null;
          priority?: WishlistPriority;
          is_surprise?: boolean;
          // Default 'attivo' lato DB. completed_at non impostabile qui:
          // vincolo wishlist_items_completed_consistency richiede
          // status = 'completato' <=> completed_at is not null.
          status?: WishlistStatus;
          created_at?: string;
          updated_at?: string;
          linked_calendar_event_id?: string | null;
        };
        Update: {
          category?: WishlistCategory;
          target?: WishlistTarget;
          title?: string;
          description?: string | null;
          price?: number | null;
          link?: string | null;
          photo_url?: string | null;
          priority?: WishlistPriority;
          is_surprise?: boolean;
          status?: WishlistStatus;
          completed_at?: string | null;
          completed_by?: string | null;
          updated_at?: string;
          linked_calendar_event_id?: string | null;
        };
        // Nessun DELETE: mai delete secco (vedi commento nella migration).
        Relationships: [
          {
            foreignKeyName: "wishlist_items_couple_id_fkey";
            columns: ["couple_id"];
            isOneToOne: false;
            referencedRelation: "couples";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wishlist_items_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wishlist_items_completed_by_fkey";
            columns: ["completed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wishlist_items_linked_calendar_event_id_fkey";
            columns: ["linked_calendar_event_id"];
            isOneToOne: false;
            referencedRelation: "calendar_events";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        // Scrittura SOLO da trigger/RPC SECURITY DEFINER (vedi
        // supabase/migrations/20260901090000_notifications.sql), mai INSERT/
        // UPDATE diretto dal client — "segna come letta" passa dalle RPC
        // mark_notification_read/mark_all_notifications_read, non da un
        // UPDATE diretto (stesso trattamento di messages.liked_by).
        Row: {
          id: string;
          couple_id: string;
          recipient_id: string;
          actor_id: string | null;
          type: NotificationType;
          title: string;
          body: string | null;
          source_table: string | null;
          source_id: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: never; // Solo dai trigger AFTER INSERT / dalla RPC toggle_message_reaction, mai dal client.
        Update: never; // Solo dalle RPC mark_notification_read/mark_all_notifications_read.
        Relationships: [
          {
            foreignKeyName: "notifications_couple_id_fkey";
            columns: ["couple_id"];
            isOneToOne: false;
            referencedRelation: "couples";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_questions: {
        // Pool statico, seedato via migration. Nessuna scrittura dal client.
        Row: {
          id: string;
          prompt: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      quiz_answers: {
        // "Indovina il partner" (v2): my_truth/my_guess immutabili dal
        // client; guess_correct scrivibile SOLO via RPC confirm_quiz_guess,
        // mai da un .update() diretto (Update resta "never" per questo).
        Row: {
          id: string;
          couple_id: string;
          profile_id: string;
          answer_date: string;
          question_id: string;
          my_truth: string;
          my_guess: string;
          guess_correct: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          profile_id: string;
          answer_date: string;
          question_id: string;
          my_truth: string;
          my_guess: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "quiz_answers_couple_id_fkey";
            columns: ["couple_id"];
            isOneToOne: false;
            referencedRelation: "couples";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quiz_answers_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quiz_answers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "quiz_questions";
            referencedColumns: ["id"];
          },
        ];
      };
      mood_checkins: {
        // Immutabile: nessun update/delete.
        Row: {
          id: string;
          couple_id: string;
          profile_id: string;
          checkin_date: string;
          mood: MoodType;
          created_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          profile_id: string;
          checkin_date: string;
          mood: MoodType;
          created_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "mood_checkins_couple_id_fkey";
            columns: ["couple_id"];
            isOneToOne: false;
            referencedRelation: "couples";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mood_checkins_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          user_agent: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          user_agent?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          endpoint?: string;
          p256dh?: string;
          auth_key?: string;
          user_agent?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      wishlist_feed: {
        // Sola lettura (le view non sono aggiornabili qui, e comunque le
        // scritture vanno sempre su wishlist_items). Stesse colonne di
        // wishlist_items tranne created_at/updated_at riordinate, MENO
        // notes-equivalenti... in realtà stesso set colonne "pubbliche" più
        // `is_hidden_surprise`. Vedi
        // supabase/migrations/20260901020000_wishlist_items.sql.
        Row: {
          id: string;
          couple_id: string;
          created_by: string;
          category: WishlistCategory;
          target: WishlistTarget;
          priority: WishlistPriority;
          is_surprise: boolean;
          status: WishlistStatus;
          // true se questa riga è una sorpresa attiva creata dal partner:
          // in quel caso i 5 campi sotto sono forzati a null dalla view.
          is_hidden_surprise: boolean;
          title: string | null;
          description: string | null;
          price: number | null;
          link: string | null;
          photo_url: string | null;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          updated_at: string;
          linked_calendar_event_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "wishlist_items_couple_id_fkey";
            columns: ["couple_id"];
            isOneToOne: false;
            referencedRelation: "couples";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      create_pairing_invite: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      accept_pairing_invite: {
        Args: { invite_code: string };
        Returns: string; // uuid della riga `couples` creata
      };
      current_couple_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      set_relationship_start_date: {
        Args: { p_date: string };
        Returns: undefined;
      };
      toggle_message_reaction: {
        Args: { message_id: string };
        Returns: boolean; // true se ora piace, false se la reazione è stata tolta
      };
      mark_notification_read: {
        Args: { notification_id: string };
        Returns: undefined;
      };
      mark_all_notifications_read: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      delete_own_account: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      leave_couple: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      set_quiz_enabled: {
        Args: { p_enabled: boolean };
        Returns: undefined;
      };
      set_mood_checkin_enabled: {
        Args: { p_enabled: boolean };
        Returns: undefined;
      };
      confirm_quiz_guess: {
        Args: { p_answer_id: string; p_correct: boolean };
        Returns: undefined;
      };
    };
    Enums: {
      event_category: EventCategory;
      event_recurrence: EventRecurrence;
      message_type: MessageType;
      appointment_status: AppointmentStatus;
      wishlist_category: WishlistCategory;
      wishlist_target: WishlistTarget;
      wishlist_priority: WishlistPriority;
      wishlist_status: WishlistStatus;
      notification_type: NotificationType;
      mood_type: MoodType;
    };
    CompositeTypes: Record<string, never>;
  };
}
