import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDueState, rotuloPrazo, formatarDataCurta, formatarDataCompleta, compararUrgencia,
  resumirPrazos, chaveAlertaCritico, DUE_SOON_DAYS, OVERDUE_CRITICAL_DAYS, rotuloPrazoLista,
} from './prazo';

const HOJE = '2026-11-21';

test('sem data = none', () => {
  assert.equal(getDueState(undefined, 'todo', HOJE).state, 'none');
  assert.equal(getDueState('', 'todo', HOJE).state, 'none');
});

test('faixas da régua', () => {
  assert.equal(getDueState('2026-11-25', 'todo', HOJE).state, 'ok');          // +4
  assert.equal(getDueState('2026-11-24', 'todo', HOJE).state, 'soon');        // +3
  assert.equal(getDueState('2026-11-22', 'todo', HOJE).state, 'soon');        // +1
  assert.equal(getDueState('2026-11-21', 'todo', HOJE).state, 'today');
  assert.equal(getDueState('2026-11-20', 'todo', HOJE).state, 'overdue');     // -1
  assert.equal(getDueState('2026-11-11', 'todo', HOJE).state, 'overdue');     // -10
  assert.equal(getDueState('2026-11-10', 'todo', HOJE).state, 'critical');    // -11
  assert.equal(getDueState('2026-08-31', 'todo', HOJE).daysLate, 82);
});

test('rótulo da lista: relativo até 7 dias, absoluto depois, ano só se diferente', () => {
  const r = (d: string | undefined, s: 'todo' | 'done' = 'todo') => rotuloPrazoLista(getDueState(d, s, HOJE), d, HOJE);
  assert.equal(r('2026-11-21'), 'Hoje');
  assert.equal(r('2026-11-22'), 'Amanhã');
  assert.equal(r('2026-11-23'), 'Em 2 dias');
  assert.equal(r('2026-11-28'), 'Em 7 dias');
  assert.equal(r('2026-11-29'), '29 nov');
  assert.equal(r('2027-01-06'), '6 jan 2027');
  assert.equal(r('2026-11-20'), 'há 1 dia');
  assert.equal(r('2026-08-20'), 'há 93 dias');
  assert.equal(r('2026-11-20', 'done'), '20 nov');
  assert.equal(r(undefined), '—');
});

test('limites seguem as constantes', () => {
  assert.equal(DUE_SOON_DAYS, 3);
  assert.equal(OVERDUE_CRITICAL_DAYS, 10);
});

test('concluída nunca fica atrasada', () => {
  assert.equal(getDueState('2026-08-31', 'done', HOJE).state, 'ok');
  // Implementação ainda não é concluída: segue contando atraso.
  assert.equal(getDueState('2026-08-31', 'implementation', HOJE).state, 'critical');
});

test('aceita data com hora (ISO)', () => {
  assert.equal(getDueState('2026-11-21T23:00:00', 'todo', HOJE).state, 'today');
});

test('rótulos', () => {
  const r = (d: string | undefined) => rotuloPrazo(getDueState(d, 'todo', HOJE), d, HOJE);
  assert.equal(r(undefined), 'Sem prazo');
  assert.equal(r('2026-11-24'), 'Vence em 3 dias');
  assert.equal(r('2026-11-22'), 'Vence amanhã');
  assert.equal(r('2026-11-21'), 'Vence hoje');
  assert.equal(r('2026-11-20'), 'Atrasada há 1 dia');
  assert.equal(r('2026-11-17'), 'Atrasada há 4 dias');
  assert.equal(r('2026-08-31'), 'Atrasada há 82 dias');
  assert.equal(r('2026-12-24'), '24/12');
});

test('formato brasileiro, ano só fora do ano atual', () => {
  assert.equal(formatarDataCurta('2026-08-31', HOJE), '31/08');
  assert.equal(formatarDataCurta('2027-01-05', HOJE), '05/01/27');
  assert.equal(formatarDataCompleta('2026-08-31'), '31/08/2026');
});

test('ordenação: vencimento, sem prazo no fim, prioridade desempata', () => {
  const lista = [
    { id: 'a', dueDate: undefined, priority: 'urgent' as const },
    { id: 'b', dueDate: '2026-11-30', priority: 'low' as const },
    { id: 'c', dueDate: '2026-11-30', priority: 'high' as const },
    { id: 'd', dueDate: '2026-09-01', priority: 'no_priority' as const },
  ];
  assert.deepEqual([...lista].sort(compararUrgencia).map(t => t.id), ['d', 'c', 'b', 'a']);
});

test('resumo conta críticas, atrasadas e em breve (inclui hoje)', () => {
  const r = resumirPrazos([
    { dueDate: '2026-08-31', status: 'todo' },
    { dueDate: '2026-11-01', status: 'paused' },
    { dueDate: '2026-11-18', status: 'todo' },
    { dueDate: '2026-11-21', status: 'todo' },
    { dueDate: '2026-11-23', status: 'todo' },
    { dueDate: '2026-11-28', status: 'todo' },
    { dueDate: '2026-12-30', status: 'todo' },
    { dueDate: '2026-11-22', status: 'done' },
    { dueDate: '2026-08-31', status: 'done' },
  ], HOJE);
  assert.deepEqual(r, { critical: 2, overdue: 1, soon: 2, week: 3 });
});

test('alerta crítico: uma vez ao cruzar, no máximo 1×/semana, recomeça se a data mudar', () => {
  const k = (hoje: string, ja: string[] = [], dueDate = '2026-11-01', status: 'todo' | 'done' = 'todo') =>
    chaveAlertaCritico({ id: 't1', dueDate, status }, ja, hoje);
  assert.equal(k('2026-11-11'), null);                 // 10 dias: ainda não
  const d11 = k('2026-11-12')!;                        // 11 dias: dispara
  assert.ok(d11);
  assert.equal(k('2026-11-12', [d11]), null);          // mesmo dia
  assert.equal(k('2026-11-18', [d11]), null);          // 6 dias depois
  const d18 = k('2026-11-19', [d11])!;                 // 7 dias depois: repete
  assert.ok(d18);
  assert.equal(k('2026-11-20', [d11, d18]), null);
  // Primeiro aviso tardio conta a semana a partir dele.
  const tarde = k('2026-11-17')!;
  assert.equal(k('2026-11-19', [tarde]), null);
  assert.ok(k('2026-11-12', [d11], '2026-10-31'));     // prazo mudou
  assert.equal(k('2026-11-30', [], '2026-11-01', 'done'), null);
});
