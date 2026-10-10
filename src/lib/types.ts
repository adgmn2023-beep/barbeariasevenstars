export type Service = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  active: boolean;
};
export type Status =
  "pendente" | "confirmado" | "cancelado" | "concluido" | "faltou";
export type Profile = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string;
  data_nascimento: string | null;
  privacy_accepted_at: string | null;
  role: "client" | "barber" | "admin" | "master";
};
export type Appointment = {
  appointment_services?: {
    service_id: string | null;
    name: string;
    price: number;
    duration_minutes: number;
  }[];
  id: string;
  client_id: string | null;
  barber_id: string | null;
  barber_name: string | null;
  service_name: string;
  price: number;
  duration_minutes: number;
  start_at: string;
  end_at: string;
  booking_date: string;
  status: Status;
  cancel_reason: string | null;
  created_at: string;
  profiles?: Profile | null;
};
export type Hours = {
  weekday: number;
  closed: boolean;
  opens: string;
  closes: string;
  lunch_start: string | null;
  lunch_end: string | null;
};
export type Settings = {
  id: number;
  slot_step: number;
  min_notice: number;
  booking_window: number;
};
export type Busy = { start_at: string; end_at: string };
