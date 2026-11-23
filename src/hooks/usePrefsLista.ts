// Filtros e exibição das tarefas, persistidos por usuário. Lista e Kanban de
// Minhas tarefas usam a mesma chave: trocar de vista mantém os filtros.
import { useEffect, useMemo, useState } from 'react';
import type { Project, Task } from '../types';
import { useAuth } from '../context/AuthContext';
import { useMarketingProjetos } from '../lib/marketingProjetos';
import { casaPeriodoPrazo } from '../lib/inboxFiltros';
import {
  casaEscopoTarefa, casaFiltrosBase, chavePrefs, gravarPrefs, lerPrefs, prefsPadrao, type PrefsLista,
} from '../lib/listaPrefs';

/** `comEscopo` = false ignora Período, Empreendimento e Projeto (o Cronograma agrupa em vez de filtrar). */
export function usePrefsLista(projects: Project[], minhas: boolean, comEscopo = true) {
  const { currentUser } = useAuth();
  const { projetos, projetoDaTarefa, carregando } = useMarketingProjetos();

  const chave = chavePrefs(currentUser?.id ?? 'anon', minhas);
  const [prefs, setPrefs] = useState<PrefsLista>(() =>
    lerPrefs(chave, prefsPadrao(minhas ? 'all' : currentUser?.id ?? 'all', minhas)));
  const mudarPrefs = (p: Partial<PrefsLista>) => setPrefs(atual => ({ ...atual, ...p }));
  useEffect(() => { gravarPrefs(chave, prefs); }, [chave, prefs]);

  // Item excluído depois de salvo no filtro não pode esconder tudo.
  const filtros = useMemo(() => ({
    ...prefs.filtros,
    empreendimentos: prefs.filtros.empreendimentos.filter(id => projects.some(p => p.id === id)),
    projetos: carregando ? prefs.filtros.projetos : prefs.filtros.projetos.filter(id => projetos.some(p => p.id === id)),
  }), [prefs.filtros, projects, projetos, carregando]);

  const agora = new Date();
  /** Todos os filtros, menos a busca e as faixas de prazo. */
  const casaFiltros = (t: Task) => {
    if (!comEscopo) return casaFiltrosBase(t, { ...filtros, empreendimentos: [] });
    if (minhas && !casaPeriodoPrazo(t.dueDate, filtros.periodo, agora)) return false;
    if (minhas && !casaEscopoTarefa(t.id, filtros, projetoDaTarefa)) return false;
    return casaFiltrosBase(t, filtros);
  };

  return { prefs, mudarPrefs, filtros, casaFiltros, projetos };
}

/** Título, descrição ou etiqueta. */
export function casaBusca(t: Task, busca: string): boolean {
  const termo = busca.trim().toLowerCase();
  return !termo
    || (t.title || '').toLowerCase().includes(termo)
    || (t.description || '').toLowerCase().includes(termo)
    || !!t.labels?.some(l => l.name.toLowerCase().includes(termo));
}
