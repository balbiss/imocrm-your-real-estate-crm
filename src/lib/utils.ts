import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Mesmo prazo usado por get_next_corretor_rodizio no banco: um corretor
// "online" que não faz check-in de novo em 30min some da fila de leads
// novos e passa a aparecer como offline em toda a tela (Roleta e Equipe).
export const ROLETA_CHECKIN_TIMEOUT_MS = 30 * 60 * 1000;

export function isCorretorOnlineNaRoleta(statusRoleta: boolean | null | undefined, ultimoCheckin: string | null | undefined): boolean {
  if (!statusRoleta || !ultimoCheckin) return false;
  const checkinTime = new Date(ultimoCheckin).getTime();
  if (Number.isNaN(checkinTime)) return false;
  return Date.now() - checkinTime < ROLETA_CHECKIN_TIMEOUT_MS;
}
