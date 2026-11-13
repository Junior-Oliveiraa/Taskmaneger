// Módulo Rede Social.
//
// Não tem tabela própria: um post é uma tarefa com a etiqueta "Social Media".
// A data de publicação é o prazo da tarefa, e a peça (imagem + copy) vem do
// painel de aprovação (`socialMediaApproval`). Canal, formato e horário são
// campos opcionais do mesmo JSON, editados no painel da tarefa.

import { supabase } from './supabase';
import type { CopyEditorItem, Delivery, Task } from '../types';

export const ETIQUETA_POST = 'Social Media';

export type Etapa = 'a_fazer' | 'fazendo' | 'aprovacao' | 'refacao' | 'concluido';

export const ETAPAS: { id: Etapa; label: string; cor: string; texto: string; fundo: string }[] = [
  { id: 'a_fazer',   label: 'A fazer',      cor: '#71717a', texto: 'text-zinc-300',    fundo: 'bg-zinc-500/15' },
  { id: 'fazendo',   label: 'Fazendo',      cor: '#60a5fa', texto: 'text-blue-300',    fundo: 'bg-blue-500/15' },
  { id: 'aprovacao', label: 'Em aprovação', cor: '#fbbf24', texto: 'text-amber-300',   fundo: 'bg-amber-500/15' },
  { id: 'refacao',   label: 'Refação',      cor: '#f87171', texto: 'text-red-300',     fundo: 'bg-red-500/15' },
  { id: 'concluido', label: 'Concluído',    cor: '#34d399', texto: 'text-emerald-300', fundo: 'bg-emerald-500/15' },
];

export const etapaInfo = (e: Etapa) => ETAPAS.find(x => x.id === e)!;

export const CANAIS = ['Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'YouTube', 'WhatsApp'];
export const FORMATOS = ['Feed 4:5', 'Feed 1:1', 'Carrossel', 'Reels', 'Stories', 'Vídeo', 'Artigo'];
const FORMATOS_VERTICAIS = ['Reels', 'Stories', 'Vídeo'];
export const formatoVertical = (f?: string) => !!f && FORMATOS_VERTICAIS.includes(f);

export function ehPost(t: Task, porId: Map<string, Task>): boolean {
  if (!t.labels.some(l => l.name === ETIQUETA_POST)) return false;
  // Filha de outro post (ex.: versão de um carrossel) não vira card próprio.
  const pai = t.parentTaskId ? porId.get(t.parentTaskId) : undefined;
  return !(pai && pai.labels.some(l => l.name === ETIQUETA_POST));
}

export function etapaDoPost(t: Task): Etapa {
  const s = t.socialMediaApproval?.status;
  if (t.status === 'done' || s === 'approved') return 'concluido';
  if (s === 'review_requested' || t.status === 'approval') return 'aprovacao';
  if (s === 'rejected' || t.status === 'rework') return 'refacao';
  if (t.status === 'no_forecast' || t.status === 'todo') return 'a_fazer';
  return 'fazendo';
}

// ── Datas ────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' no fuso local (o prazo das tarefas é uma data, sem hora). */
export const isoDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const deIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const somaDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Segunda-feira da semana de `d`. */
export function inicioSemana(d: Date): Date {
  const dow = (d.getDay() + 6) % 7; // seg = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
}

export function numeroSemana(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const inicioAno = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7);
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
export const DIAS_CURTOS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const DIAS_LONGOS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export const nomeMes = (m: number) => MESES[m];

/** "9 a 15 de novembro" ou "30 de nov. a 6 de dez." */
export function rotuloIntervalo(inicio: Date): string {
  const fim = somaDias(inicio, 6);
  if (inicio.getMonth() === fim.getMonth()) return `${inicio.getDate()} a ${fim.getDate()} de ${MESES[fim.getMonth()]}`;
  return `${inicio.getDate()} de ${MESES_CURTOS[inicio.getMonth()]} a ${fim.getDate()} de ${MESES_CURTOS[fim.getMonth()]}`;
}

/** "Quarta 11" */
export function rotuloDia(iso: string): string {
  const d = deIso(iso);
  return `${DIAS_LONGOS[(d.getDay() + 6) % 7]} ${d.getDate()}`;
}

/** "qua 11" */
export function rotuloDiaCurto(iso: string): string {
  const d = deIso(iso);
  return `${DIAS_CURTOS[(d.getDay() + 6) % 7].toLowerCase()} ${d.getDate()}`;
}

// ── Prévia da peça ───────────────────────────────────────────────────────

export interface FontesPrevia {
  deliveries: Record<string, Delivery[]>;
  editors: Record<string, CopyEditorItem[]>;
}

/** Tarefas de Design/Copy cujas entregas a prévia dos posts precisa. */
export function idsDasFontes(posts: Task[]): string[] {
  const ids = new Set<string>();
  for (const p of posts) {
    const a = p.socialMediaApproval;
    if (!a) continue;
    if ((a.imageSource || 'approved') === 'approved' && a.selectedDesignTaskId) ids.add(a.selectedDesignTaskId);
    if ((a.copySource || 'approved') === 'approved' && a.selectedCopyTaskId) ids.add(a.selectedCopyTaskId);
  }
  return [...ids].sort();
}

/**
 * Busca só as entregas e os editores das tarefas escolhidas no painel. A lista
 * geral de tarefas não traz os briefings (pesam vários MB), então a prévia é
 * carregada aqui, limitada aos posts que estão na tela.
 */
export async function fetchFontesPrevia(ids: string[]): Promise<FontesPrevia> {
  const fontes: FontesPrevia = { deliveries: {}, editors: {} };
  if (ids.length === 0) return fontes;
  const { data, error } = await supabase
    .from('tasks')
    .select('id, deliveries:design_briefing->deliveries, editors:copy_briefing->copyEditors')
    .in('id', ids);
  if (error) throw new Error(`[Rede Social] prévias: ${error.message}`);
  for (const r of (data || []) as any[]) {
    if (Array.isArray(r.deliveries)) fontes.deliveries[r.id] = r.deliveries;
    if (Array.isArray(r.editors)) fontes.editors[r.id] = r.editors;
  }
  return fontes;
}

export function imagemDoPost(t: Task, fontes?: FontesPrevia): string | undefined {
  const a = t.socialMediaApproval;
  if (!a) return undefined;
  if (a.imageSource === 'custom') return a.customImageUrls?.[0];
  if (!a.selectedDesignTaskId || !a.selectedDesignDeliveryId) return undefined;
  const del = fontes?.deliveries[a.selectedDesignTaskId]?.find(d => d.id === a.selectedDesignDeliveryId);
  if (!del) return undefined;
  return del.imageUrls?.[0] || del.imageUrl || del.thumbnailUrl;
}

export function htmlParaTexto(html?: string): string {
  if (!html) return '';
  try {
    return (new DOMParser().parseFromString(html, 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
  } catch {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

export function copyDoPost(t: Task, fontes?: FontesPrevia): string {
  const a = t.socialMediaApproval;
  if (!a) return '';
  if (a.copySource === 'custom') return htmlParaTexto(a.customCopy);
  if (!a.selectedCopyTaskId || !a.selectedCopyEditorId) return '';
  const ed = fontes?.editors[a.selectedCopyTaskId]?.find(e => e.id === a.selectedCopyEditorId);
  return htmlParaTexto(ed?.content);
}
