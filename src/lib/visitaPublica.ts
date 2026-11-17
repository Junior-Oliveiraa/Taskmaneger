// Cadastro de visitas pelas recepcionistas: página pública em /visita/<token>.
// Só fala com duas RPCs (get_form_visita e registrar_visita_publica); o token
// é o segredo do link e não dá acesso a mais nada.
import { supabase } from './supabase';

export const VISITA_BASE_PATH = '/visita';

export function visitaPublicaUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${VISITA_BASE_PATH}/${token}`;
}

export interface FormVisitaPublica {
  /** Nome do link, ex.: "Casa Uchôa" ou "Supervisor (todos os locais)". */
  nome: string;
  /** Local fixo do link; nulo no link genérico (o local é escolhido). */
  local: string | null;
  locais: string[];
  /** yyyy-mm-dd, fuso de Brasília. */
  hoje: string;
  empreendimentos: { id: string; nome: string }[];
  corretores: string[];
}

/** Null quando o link não existe ou foi desativado. */
export async function fetchFormVisita(token: string): Promise<FormVisitaPublica | null> {
  const { data, error } = await supabase.rpc('get_form_visita', { p_token: token });
  if (error) throw error;
  return (data as FormVisitaPublica | null) ?? null;
}

export interface VisitaPublicaDados {
  local: string | null;
  cliente: string;
  /** yyyy-mm-dd */
  data: string;
  /** HH:MM; vazio = hora do envio (se a visita for de hoje). */
  hora: string;
  interesse: 'especifico' | 'geral';
  projectId: string | null;
  corretor: string;
  profissao: string;
  ondeMora: string;
  idade: number | null;
  estadoCivil: string;
  observacao: string;
}

/** Devolve o número do registro (P0001). */
export async function registrarVisitaPublica(token: string, dados: VisitaPublicaDados): Promise<number | null> {
  const { data, error } = await supabase.rpc('registrar_visita_publica', { p_token: token, p_dados: dados });
  if (error) throw error;
  return data == null ? null : Number(data);
}

// ── Gestão dos links (app interno, só Diretor) ─────────────────────────────

export interface VisitaLink {
  id: string;
  token: string;
  nome: string;
  local: string | null;
  ativo: boolean;
  sortOrder: number;
}

export async function fetchVisitaLinks(): Promise<VisitaLink[]> {
  const { data, error } = await supabase
    .from('comercial_visita_links')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id, token: r.token, nome: r.nome, local: r.local ?? null, ativo: !!r.ativo, sortOrder: r.sort_order ?? 0,
  }));
}

export async function ativarVisitaLink(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from('comercial_visita_links').update({ ativo, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function renovarVisitaLink(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('renovar_visita_link', { p_id: id });
  if (error) throw error;
  return String(data);
}
