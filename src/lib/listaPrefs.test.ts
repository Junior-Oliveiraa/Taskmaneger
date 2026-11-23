import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDueState } from './prazo';
import { casaPeriodoPrazo } from './inboxFiltros';
import { casaEscopoTarefa, casaFiltrosBase, casaPrazo, contarFiltros, normalizarPrefs, prefsPadrao, FILTROS_VAZIOS } from './listaPrefs';

const HOJE = '2026-11-21';
const info = (d: string | undefined, s: 'todo' | 'done' = 'todo') => getDueState(d, s, HOJE);

test('filtro de prazo: sem seleção passa tudo; várias opções somam', () => {
  assert.ok(casaPrazo(info('2026-08-31'), []));
  assert.ok(casaPrazo(info('2026-08-31'), ['critical']));
  assert.ok(!casaPrazo(info('2026-11-20'), ['critical']));
  assert.ok(casaPrazo(info('2026-11-20'), ['critical', 'overdue']));
  assert.ok(casaPrazo(info('2026-11-28'), ['week']));
  assert.ok(!casaPrazo(info('2026-11-29'), ['week']));
  assert.ok(!casaPrazo(info('2026-11-22', 'done'), ['week']));
  assert.ok(casaPrazo(info(undefined), ['none']));
});

test('prioridade e empreendimento combinam com E', () => {
  const f = { ...FILTROS_VAZIOS, prioridades: ['urgent' as const], empreendimentos: ['p1'] };
  assert.ok(casaFiltrosBase({ priority: 'urgent', projectId: 'p1' }, f));
  assert.ok(!casaFiltrosBase({ priority: 'urgent', projectId: 'p2' }, f));
  assert.ok(!casaFiltrosBase({ priority: 'low', projectId: 'p1' }, f));
});

test('contador ignora responsável em Minhas tarefas', () => {
  const f = { ...FILTROS_VAZIOS, prioridades: ['urgent' as const], empreendimentos: ['p1'], responsavel: 'u1' };
  assert.equal(contarFiltros(f, true), 3);
  assert.equal(contarFiltros(f, false), 2);
});

test('preferência corrompida cai no padrão', () => {
  const p = prefsPadrao('u1');
  assert.deepEqual(normalizarPrefs(null, p), p);
  const n = normalizarPrefs({ groupBy: 'xyz', filtros: { prioridades: ['urgent', 'lixo'], prazos: 'x' }, recolhidos: [1, 'a'] }, p);
  assert.equal(n.groupBy, 'status');
  assert.deepEqual(n.filtros.prioridades, ['urgent']);
  assert.deepEqual(n.filtros.prazos, []);
  assert.deepEqual(n.recolhidos, ['a']);
  assert.deepEqual(n.filtros.periodo, { preset: 'todo' });
  assert.deepEqual(n.filtros.projetos, []);
  assert.deepEqual(normalizarPrefs({ filtros: { periodo: { preset: 'prox7' } } }, p).filtros.periodo, { preset: 'prox7' });
  assert.deepEqual(normalizarPrefs({ filtros: { periodo: { preset: 'personalizado', de: 'x' } } }, p).filtros.periodo, { preset: 'todo' });
});

test('período do prazo tem as duas pontas; sem prazo só em "todo"', () => {
  const agora = new Date(2026, 10, 21);
  const c = (d: string | undefined, preset: any) => casaPeriodoPrazo(d, { preset }, agora);
  assert.ok(c(undefined, 'todo'));
  assert.ok(!c(undefined, 'hoje'));
  assert.ok(c('2026-11-21', 'hoje') && !c('2026-11-22', 'hoje') && !c('2026-11-20', 'hoje'));
  assert.ok(c('2026-11-15', '7d') && !c('2026-11-14', '7d') && !c('2026-11-22', '7d'));
  assert.ok(c('2026-11-27', 'prox7') && !c('2026-11-28', 'prox7') && !c('2026-11-20', 'prox7'));
  assert.ok(c('2026-11-30', 'mes') && !c('2026-12-01', 'mes') && !c('2026-10-31', 'mes'));
  assert.ok(c('2026-10-31', 'mes-passado') && !c('2026-11-01', 'mes-passado'));
  assert.ok(casaPeriodoPrazo('2026-11-05', { preset: 'personalizado', de: '2026-11-01', ate: '2026-11-05' }, agora));
});

test('filtro de projeto', () => {
  const proj = { t1: 'a', t2: 'b' };
  const c = (id: string, projetos: string[]) => casaEscopoTarefa(id, { projetos }, proj);
  assert.ok(c('t3', []));
  assert.ok(c('t2', ['b']) && !c('t1', ['b']) && !c('t3', ['b']));
});
