import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from '../types';
import { conciliarDatas } from './dataInicio';
import { barraDaTarefa, diasDaJanela, inicioDaTarefa, moverJanela, noCronograma, progressoDaTarefa, rotuloJanela, rotuloPrazoCurto, situacaoDoStatus, trechoNaJanela } from './cronograma';

const HOJE = '2026-11-22'; // domingo
const semana = diasDaJanela('semana', HOJE);
const mes = diasDaJanela('mes', HOJE);

test('janelas: semana de segunda a domingo e mês inteiro', () => {
  assert.deepEqual([semana[0], semana[6], semana.length], ['2026-11-16', '2026-11-22', 7]);
  assert.deepEqual([mes[0], mes[mes.length - 1]], ['2026-11-01', '2026-11-30']);
  assert.equal(diasDaJanela('mes', '2028-02-10').length, 29);
});

test('mover: mês não pula fevereiro', () => {
  assert.equal(moverJanela('mes', '2027-01-31', 1), '2027-02-01');
  assert.equal(moverJanela('mes', '2027-01-15', -1), '2026-12-01');
  assert.equal(moverJanela('semana', HOJE, 1), '2026-11-29');
});

test('rótulo do período', () => {
  assert.equal(rotuloJanela('mes', mes), 'Novembro 2026');
  assert.equal(rotuloJanela('semana', semana), '16 – 22 nov 2026');
  assert.equal(rotuloJanela('semana', diasDaJanela('semana', '2026-12-01')), '30 nov – 6 dez 2026');
  assert.equal(rotuloJanela('semana', diasDaJanela('semana', '2026-12-30')), '28 dez 2026 – 3 jan 2027');
});

test('início: 1ª vez em progresso, senão criação, nunca depois do prazo', () => {
  const h = (d: string) => ({ status: 'in_progress' as const, enteredAt: d });
  assert.equal(inicioDaTarefa({ createdAt: '2026-11-01', dueDate: '2026-11-20' }), '2026-11-01');
  assert.equal(inicioDaTarefa({ createdAt: '2026-11-01', dueDate: '2026-11-20', statusHistory: [h('2026-11-10'), h('2026-11-05')] }), '2026-11-05');
  assert.equal(inicioDaTarefa({ createdAt: '2026-11-25', dueDate: '2026-11-20' }), '2026-11-20');
});

test('início programado vence a estimativa', () => {
  const t = { createdAt: '2026-11-01', dueDate: '2026-11-20', startDate: '2026-11-15', status: 'todo' as const };
  assert.equal(inicioDaTarefa(t), '2026-11-15');
  assert.equal(inicioDaTarefa({ ...t, startDate: '2026-11-25' }), '2026-11-20');
  assert.equal(barraDaTarefa(t, mes, HOJE)!.programado, true);
  assert.equal(barraDaTarefa({ ...t, startDate: undefined }, mes, HOJE)!.programado, false);
});

test('início e prazo não se cruzam', () => {
  const antes = { startDate: '2026-11-10', dueDate: '2026-11-20' };
  assert.equal(conciliarDatas(antes, { ...antes, dueDate: '2026-11-15' }), 'ok');
  assert.equal(conciliarDatas(antes, { ...antes, dueDate: '2026-11-05' }), 'ajustar-inicio');
  assert.equal(conciliarDatas(antes, { ...antes, startDate: '2026-11-25' }), 'recusar-inicio');
  assert.equal(conciliarDatas(antes, { startDate: '2026-11-25', dueDate: '2026-11-30' }), 'ok');
  assert.equal(conciliarDatas(antes, { startDate: '2026-11-25', dueDate: undefined }), 'ok');
});

test('trecho: recorta nas bordas e some fora da janela', () => {
  assert.deepEqual(trechoNaJanela('2026-11-10', '2026-11-18', semana), { col: 0, span: 3, cortaEsq: true, cortaDir: false });
  assert.deepEqual(trechoNaJanela('2026-11-20', '2026-12-05', semana), { col: 4, span: 3, cortaEsq: false, cortaDir: true });
  assert.deepEqual(trechoNaJanela('2026-11-16', '2026-11-22', semana), { col: 0, span: 7, cortaEsq: false, cortaDir: false });
  assert.equal(trechoNaJanela('2026-11-01', '2026-11-15', semana), null);
  assert.equal(trechoNaJanela('2026-11-23', '2026-11-25', semana), null);
});

test('barra: termina no prazo; atrasada de antes fica sem barra; concluída antiga some', () => {
  const base = { createdAt: '2026-11-03', status: 'todo' as const };
  assert.equal(barraDaTarefa({ ...base }, mes, HOJE), null);
  const b = barraDaTarefa({ ...base, dueDate: '2026-11-10' }, semana, HOJE)!;
  assert.equal(b.barra, null);
  assert.equal(b.diasAtraso, 12);
  const m = barraDaTarefa({ ...base, dueDate: '2026-11-10' }, mes, HOJE)!;
  assert.deepEqual(m.barra, { col: 2, span: 8, cortaEsq: false, cortaDir: false });
  assert.equal(m.diasAtraso, 12);
  assert.equal(barraDaTarefa({ ...base, status: 'done', dueDate: '2026-11-10' }, semana, HOJE), null);
  assert.equal(barraDaTarefa({ ...base, dueDate: HOJE }, mes, HOJE)!.diasAtraso, 0);
  // Num mês futuro, o atraso de hoje não aparece.
  assert.equal(barraDaTarefa({ ...base, dueDate: '2026-11-10' }, diasDaJanela('mes', '2027-01-10'), HOJE), null);
});

test('cor: cinza só em pausado', () => {
  assert.deepEqual((['todo', 'in_progress', 'approval', 'rework', 'implementation', 'paused', 'done'] as const).map(situacaoDoStatus),
    ['ativa', 'ativa', 'ativa', 'ativa', 'ativa', 'pausada', 'concluida']);
});

test('progresso pelo status; pausado herda o anterior', () => {
  const h = (...status: Task['status'][]) => status.map(s => ({ status: s, enteredAt: '2026-11-01' }));
  assert.deepEqual((['todo', 'in_progress', 'rework', 'approval', 'implementation', 'done'] as const).map(status => progressoDaTarefa({ status })),
    [0, 0.25, 0.5, 0.75, 0.9, 1]);
  assert.equal(progressoDaTarefa({ status: 'paused', statusHistory: h('todo', 'in_progress', 'approval', 'paused') }), 0.75);
  assert.equal(progressoDaTarefa({ status: 'paused', statusHistory: h('in_progress', 'paused', 'paused') }), 0.25);
  assert.equal(progressoDaTarefa({ status: 'paused', statusHistory: [] }), 0);
});

test('sem previsão ou sem prazo fica fora', () => {
  assert.equal(noCronograma({ status: 'no_forecast', dueDate: '2026-11-10' }), false);
  assert.equal(noCronograma({ status: 'todo' }), false);
  assert.equal(noCronograma({ status: 'todo', dueDate: '2026-11-10' }), true);
});

test('prazo num formato só', () => {
  assert.equal(rotuloPrazoCurto('2026-08-28', 'todo', HOJE), 'Atrasada · 86d');
  assert.equal(rotuloPrazoCurto(HOJE, 'todo', HOJE), 'Hoje');
  assert.equal(rotuloPrazoCurto('2026-11-24', 'todo', HOJE), 'Em 2d');
  assert.equal(rotuloPrazoCurto('2026-11-30', 'todo', HOJE), '30 nov');
  assert.equal(rotuloPrazoCurto('2026-11-10', 'done', HOJE), '10 nov');
  assert.equal(rotuloPrazoCurto(undefined, 'todo', HOJE), '—');
});
