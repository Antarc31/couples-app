/**
 * Icone dell'interfaccia — restyling design brief v2 (vedi
 * https://claude.ai/code/artifact/8965fdcf-b344-4c66-9a3d-345904c83cc5):
 * niente più emoji per navigazione/azioni/stati vuoti, solo icone lineari
 * coerenti (libreria Lucide, scelta con l'utente). Le emoji restano SOLO
 * dentro contenuti scritti dall'utente (un messaggio, una nota) — quelle
 * non passano da qui, non c'è nulla da "sostituire" lì.
 *
 * Ri-esportate una per una (non `export * from "lucide-react"`) così ogni
 * componente importa da questo unico file invece che dal pacchetto
 * direttamente, e l'elenco qui sotto resta la lista completa di cosa è
 * davvero in uso nell'app — aggiungerne una nuova è una riga qui, non un
 * nuovo import sparso.
 */
export {
  Heart,
  Calendar,
  CalendarDays,
  Gift,
  MessageCircle,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Check,
  Bell,
  X,
  Sparkles,
  Smile,
  Clock,
  MapPin,
  Repeat,
  PartyPopper,
  Trash2,
  Pencil,
  LogOut,
  Copy,
  Link2,
  Home,
  User,
  Trophy,
  Camera,
  Image as ImageIcon,
  Brain,
} from "lucide-react";
