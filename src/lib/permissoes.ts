// Perfis de acesso do Orbit.
//
// A regra de verdade mora no banco (RLS + checagens nas RPCs, migração
// 20261112120000_perfis_de_acesso). Este arquivo só decide o que a TELA mostra:
// esconder um menu daqui não protege nada sozinho, mas evita oferecer ao
// usuário um botão que o banco vai recusar.

import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from '../context/AuthContext';

export type Perfil = 'administrador' | 'master' | 'analista' | 'assistente' | 'financeiro';
export type PerfilConfiguravel = Exclude<Perfil, 'administrador'>;
export type Nivel = 'nenhum' | 'ver' | 'editar';

export type Modulo =
  | 'tarefas'
  | 'empreendimentos'
  | 'crm'
  | 'financas'
  | 'financas_orcamento'
  | 'comercial_movimentos'
  | 'comercial_propostas'
  | 'comercial_tabela'
  | 'comercial_dashboard'
  | 'analytics';

export const PERFIS: { id: Perfil; label: string; descricao: string }[] = [
  { id: 'administrador', label: 'Administrador', descricao: 'Acesso total, incluindo usuários, permissões e ações críticas.' },
  { id: 'master',        label: 'Master',        descricao: 'Todas as ferramentas, sem as ações críticas do administrador.' },
  { id: 'analista',      label: 'Analista',      descricao: 'Acesso definido pelo administrador.' },
  { id: 'assistente',    label: 'Assistente',    descricao: 'Acesso definido pelo administrador.' },
  { id: 'financeiro',    label: 'Financeiro',    descricao: 'Acesso definido pelo administrador.' },
];

export const PERFIS_CONFIGURAVEIS: PerfilConfiguravel[] = ['master', 'analista', 'assistente', 'financeiro'];

export const rotuloPerfil = (p?: string | null) => PERFIS.find(x => x.id === p)?.label ?? 'Assistente';

export const MODULOS: { id: Modulo; grupo: string; label: string; descricao: string }[] = [
  { id: 'tarefas',              grupo: 'Operação',   label: 'Tarefas',            descricao: 'Kanban, lista, calendário e histórico das tarefas.' },
  { id: 'empreendimentos',      grupo: 'Operação',   label: 'Empreendimentos',    descricao: 'Cadastro e cards dos empreendimentos.' },
  { id: 'crm',                  grupo: 'Operação',   label: 'CRM',                descricao: 'Leads, cadências e próximas ações.' },
  { id: 'financas',             grupo: 'Finanças',   label: 'Títulos e lotes',    descricao: 'Títulos, aprovações, lotes, faturas e mensalidades.' },
  { id: 'financas_orcamento',   grupo: 'Finanças',   label: 'Metas e orçamento',  descricao: 'Aba Metas: orçamento de marketing x VGV.' },
  { id: 'comercial_movimentos', grupo: 'Comercial',  label: 'Início e histórico', descricao: 'Lançamento de vendas, reservas e distratos.' },
  { id: 'comercial_propostas',  grupo: 'Comercial',  label: 'Propostas',          descricao: 'Propostas, fluxo de pagamento e fichas.' },
  { id: 'comercial_tabela',     grupo: 'Comercial',  label: 'Tabela de Vendas',   descricao: 'Preços, reajustes, versões e LP do corretor.' },
  { id: 'comercial_dashboard',  grupo: 'Comercial',  label: 'Dashboard',          descricao: 'Desempenho, metas comerciais e relatórios.' },
  { id: 'analytics',            grupo: 'Análise',    label: 'Analytics',          descricao: 'Painel analítico de produtividade.' },
];

/** Ações que nenhum perfil recebe: só o administrador executa. */
export const ACOES_ADMIN: string[] = [
  'Cadastrar, editar e remover usuários',
  'Definir o perfil de cada usuário e distribuir os acessos',
  'Excluir e renomear empreendimentos',
  'Excluir unidades e versões da Tabela de Vendas',
  'Reverter revisões (reajustes) da Tabela de Vendas',
  'Gerar novo link de validação da LP do corretor',
  'Configurar a alçada de aprovação dos títulos',
  'Configurar o e-mail automático do relatório de vendas',
  'Configurar a integração com o WhatsApp',
];

export const MODULOS_COMERCIAL: Modulo[] = ['comercial_movimentos', 'comercial_propostas', 'comercial_tabela', 'comercial_dashboard'];

export type MatrizPermissoes = Record<PerfilConfiguravel, Partial<Record<Modulo, Nivel>>>;

export async function fetchMatrizPermissoes(): Promise<MatrizPermissoes> {
  const { data, error } = await supabase.from('perfis_permissoes').select('perfil, modulo, nivel');
  if (error) throw new Error(`[Permissões] carregar: ${error.message}`);
  const matriz: MatrizPermissoes = { master: {}, analista: {}, assistente: {}, financeiro: {} };
  for (const r of data || []) {
    if (r.perfil in matriz) matriz[r.perfil as PerfilConfiguravel][r.modulo as Modulo] = r.nivel as Nivel;
  }
  return matriz;
}

export async function salvarPermissao(perfil: PerfilConfiguravel, modulo: Modulo, nivel: Nivel, userId?: string) {
  const { error } = await supabase
    .from('perfis_permissoes')
    .upsert({ perfil, modulo, nivel, updated_at: new Date().toISOString(), updated_by: userId ?? null });
  if (error) throw new Error(`[Permissões] salvar: ${error.message}`);
}

const ORDEM: Record<Nivel, number> = { nenhum: 0, ver: 1, editar: 2 };

export interface Permissoes {
  perfil: Perfil;
  carregando: boolean;
  isAdmin: boolean;
  /** Administrador ou master — o antigo "nível 1". */
  isMaster: boolean;
  nivel: (modulo: Modulo) => Nivel;
  pode: (modulo: Modulo, nivel?: Exclude<Nivel, 'nenhum'>) => boolean;
  podeAlgum: (modulos: Modulo[], nivel?: Exclude<Nivel, 'nenhum'>) => boolean;
}

export function usePermissoes(): Permissoes {
  const { currentUser } = useAuth();
  const perfil = (currentUser?.perfil ?? 'assistente') as Perfil;
  const isAdmin = perfil === 'administrador';

  const { data: matriz, isLoading } = useQuery({
    queryKey: ['perfisPermissoes'],
    queryFn: fetchMatrizPermissoes,
    enabled: !!currentUser && !isAdmin,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const nivel = (modulo: Modulo): Nivel => {
    if (isAdmin) return 'editar';
    return matriz?.[perfil as PerfilConfiguravel]?.[modulo] ?? 'nenhum';
  };
  const pode = (modulo: Modulo, n: Exclude<Nivel, 'nenhum'> = 'ver') => ORDEM[nivel(modulo)] >= ORDEM[n];
  const podeAlgum = (modulos: Modulo[], n: Exclude<Nivel, 'nenhum'> = 'ver') => modulos.some(m => pode(m, n));

  return {
    perfil,
    carregando: !isAdmin && isLoading,
    isAdmin,
    isMaster: isAdmin || perfil === 'master',
    nivel,
    pode,
    podeAlgum,
  };
}
