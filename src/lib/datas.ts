// Datas no fuso LOCAL do usuário.
// `new Date().toISOString()` devolve UTC: no Brasil, depois das 21h ele já
// aponta para o dia seguinte e uma tarefa que vence hoje aparece atrasada.

/** YYYY-MM-DD da data informada (padrão: agora), no fuso local. */
export function isoLocal(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

/** Hoje, YYYY-MM-DD, no fuso local. */
export const hojeLocal = () => isoLocal();

/** Hoje + n dias, YYYY-MM-DD, no fuso local. */
export function somarDias(n: number, base: Date = new Date()): string {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}

/** Segunda-feira 00:00 da semana da data informada. */
export function inicioDaSemana(base: Date = new Date()): Date {
  const d = new Date(base);
  const dia = d.getDay();
  d.setDate(d.getDate() - dia + (dia === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Domingo 23:59:59.999 da semana que começa em `inicio`. */
export function fimDaSemana(inicio: Date): Date {
  const d = new Date(inicio);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** "Hoje", "Amanhã", "Ontem" ou dd/mm para um prazo YYYY-MM-DD. */
export function rotuloPrazo(prazo?: string): string {
  if (!prazo) return '';
  const p = prazo.slice(0, 10);
  if (p === hojeLocal()) return 'Hoje';
  if (p === somarDias(1)) return 'Amanhã';
  if (p === somarDias(-1)) return 'Ontem';
  const [, m, dia] = p.split('-');
  return `${dia}/${m}`;
}
