import test from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from '../types';
import type { MarketingProjeto } from './marketingProjetos';
import { casaFiltros, montarLinhas, montarSemProjeto, normalizarPrefs, ordenar, PREFS_PADRAO } from './projetosLista';

const HOJE = '2026-11-22';
const projeto = (id: string, p: Partial<MarketingProjeto> = {}): MarketingProjeto => ({
  id, nome: id, descricao: '', cor: '#000', status: 'ativo', sortOrder: 0, dataEntrega: null,
  prioridade: 'no_priority', dataInicio: null, empreendimentoIds: [], ...p,
});
const tarefa = (id: string, t: Partial<Task> = {}) => ({ id, title: id, status: 'todo', priority: 'low', labels: [], ...t }) as unknown as Task;

const linhas = montarLinhas({
  hoje: HOJE,
  usuarioId: 'eu',
  projetos: [
    projeto('b', { dataEntrega: '2026-12-01' }),
    projeto('vencido', { nome: 'Lançamentos', dataEntrega: '2026-11-20' }),
    projeto('fim', { status: 'concluido', dataEntrega: '2026-01-01' }),
    projeto('a', { empreendimentoIds: ['e1', 'apagado', 'e2'] }),
  ],
  tasks: [
    tarefa('1', { status: 'done', dueDate: '2026-11-01' }),
    tarefa('2', { dueDate: '2026-11-21', responsaveis: ['outro', 'eu'] }),
    tarefa('3', { dueDate: HOJE }),
  ],
  projetoDaTarefa: { 1: 'b', 2: 'b', 3: 'b' },
  membrosDoProjeto: { a: ['eu'] },
  empreendimentos: [{ id: 'e1', name: 'Jardim Ipê' }, { id: 'e2', name: 'Alvorada' }],
});
const l = (id: string) => linhas.find(x => x.projeto.id === id)!;
const F = { busca: '', soMeus: false, foco: null };

test('resumo: atrasada é só aberta com prazo antes de hoje', () => {
  assert.deepEqual(l('b').resumo, { total: 3, concluidas: 1, atrasadas: 1 });
});

test('entrega vencida conta atraso; projeto concluído nunca atrasa', () => {
  assert.equal(l('vencido').diasAtraso, 2);
  assert.equal(l('fim').diasAtraso, 0);
});

test('meu = membro cadastrado ou responsável por tarefa', () => {
  assert.deepEqual(linhas.filter(x => casaFiltros(x, { ...F, soMeus: true })).map(x => x.projeto.id), ['b', 'a']);
});

test('filtros: entrega vencida e busca sem acento', () => {
  assert.deepEqual(linhas.filter(x => casaFiltros(x, { ...F, foco: 'vencidas' })).map(x => x.projeto.id), ['vencido']);
  assert.deepEqual(linhas.filter(x => casaFiltros(x, { ...F, busca: 'lancamentos' })).map(x => x.projeto.id), ['vencido']);
});

test('empreendimentos: vários por projeto, sem os excluídos, e entram na busca', () => {
  assert.deepEqual(l('a').empreendimentos.map(e => e.name), ['Jardim Ipê', 'Alvorada']);
  assert.deepEqual(l('b').empreendimentos, []);
  assert.deepEqual(linhas.filter(x => casaFiltros(x, { ...F, busca: 'alvorada' })).map(x => x.projeto.id), ['a']);
  assert.deepEqual(linhas.filter(x => casaFiltros(x, { ...F, busca: 'ipe' })).map(x => x.projeto.id), ['a']);
});

test('sem projeto: reúne as soltas; some quando não há nenhuma em aberto', () => {
  const tasks = [
    tarefa('1'),
    tarefa('2', { dueDate: '2026-11-21', responsaveis: ['eu'] }),
    tarefa('3', { status: 'done' }),
  ];
  const s = montarSemProjeto({ hoje: HOJE, usuarioId: 'eu', tasks, projetoDaTarefa: { 1: 'b' } })!;
  assert.deepEqual(s.tarefas.map(t => t.id), ['2', '3']);
  assert.deepEqual(s.resumo, { total: 2, concluidas: 1, atrasadas: 1 });
  assert.equal(s.meu, true);
  assert.equal(montarSemProjeto({ hoje: HOJE, tasks, projetoDaTarefa: { 1: 'b', 2: 'b' } }), null);
});

test('ordem por entrega: mais próxima, sem data, concluídos no fim', () => {
  assert.deepEqual(ordenar(linhas, 'entrega').map(x => x.projeto.id), ['vencido', 'b', 'a', 'fim']);
});

test('preferências inválidas voltam ao padrão', () => {
  assert.deepEqual(normalizarPrefs({ ordem: 'x', soMeus: 'y' }), PREFS_PADRAO);
  assert.deepEqual(normalizarPrefs(null), PREFS_PADRAO);
});
