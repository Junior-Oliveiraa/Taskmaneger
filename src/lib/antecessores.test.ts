import { test } from 'node:test';
import assert from 'node:assert/strict';
import { antecessorAtrasado, antecessoresPendentes, avancaStatus, criaCiclo, datasExigemJustificativa, liberadasPor } from './antecessores';
import { mudancasDeDatas, textoMudanca } from './dataInicio';
import type { TaskStatus } from '../types';

const t = (id: string, status: TaskStatus = 'todo', dueDate?: string) => ({ id, status, dueDate });

test('pendentes: só os não concluídos e visíveis', () => {
  const mapa = { c: ['a', 'b', 'invisivel'] };
  assert.deepEqual(antecessoresPendentes('c', mapa, [t('a', 'done'), t('b'), t('c')]).map(x => x.id), ['b']);
  assert.deepEqual(antecessoresPendentes('x', mapa, [t('a')]), []);
});

test('ciclo direto e indireto', () => {
  const mapa = { b: ['a'], c: ['b'] };
  assert.ok(criaCiclo('a', 'c', mapa));
  assert.ok(criaCiclo('a', 'a', mapa));
  assert.ok(!criaCiclo('c', 'a', mapa));
  assert.ok(!criaCiclo('z', 'a', { a: ['b'], b: ['a'] })); // laço já existente não trava
});

test('status: avançar é barrado; voltar, pausar e refazer não', () => {
  for (const [de, para, barra] of [
    ['todo', 'in_progress', true], ['todo', 'done', true], ['paused', 'approval', true], ['todo', 'rework', true], ['in_progress', 'implementation', true],
    ['in_progress', 'paused', false], ['in_progress', 'todo', false], ['approval', 'rework', false], ['done', 'in_progress', false], ['todo', 'no_forecast', false], ['todo', 'todo', false],
  ] as [TaskStatus, TaskStatus, boolean][]) assert.equal(avancaStatus(de, para), barra, `${de} → ${para}`);
});

test('libera só quem não espera mais ninguém', () => {
  const mapa = { b: ['a'], c: ['a', 'x'], d: ['a'] };
  const tasks = [t('a'), t('x'), t('b'), t('c'), t('d', 'done')];
  assert.deepEqual(liberadasPor('a', mapa, tasks).map(x => x.id), ['b']);
});

test('atraso do antecessor', () => {
  assert.ok(antecessorAtrasado(t('a', 'in_progress', '2026-11-20'), '2026-11-22'));
  assert.ok(!antecessorAtrasado(t('a', 'in_progress', '2026-11-22'), '2026-11-22'));
  assert.ok(!antecessorAtrasado(t('a', 'done', '2026-11-20'), '2026-11-22'));
  assert.ok(!antecessorAtrasado(t('a', 'todo'), '2026-11-22'));
});

test('justificativa: só para data que já existia e mudou', () => {
  const antes = { startDate: '2026-11-10', dueDate: '2026-11-24' };
  assert.deepEqual(mudancasDeDatas({}, { startDate: '2026-11-10', dueDate: '2026-11-24' }), []);
  assert.deepEqual(mudancasDeDatas(antes, { dueDate: '2026-11-24T00:00:00' }), []);
  assert.deepEqual(mudancasDeDatas(antes, {}), []);
  const m = mudancasDeDatas(antes, { startDate: '', dueDate: '2026-11-30' });
  assert.deepEqual(m.map(textoMudanca), ['Início de 10/11/2026 para sem data', 'Prazo de 24/11/2026 para 30/11/2026']);
});

test('justificativa: só em tarefa de projeto ou antecessora de outra', () => {
  const projetos = { p: 'projeto-1' };
  const mapa = { b: ['a'] };
  assert.equal(datasExigemJustificativa('p', projetos, mapa), true);  // de projeto
  assert.equal(datasExigemJustificativa('a', projetos, mapa), true);  // antecessora de b
  assert.equal(datasExigemJustificativa('b', projetos, mapa), false); // só depende de outra
  assert.equal(datasExigemJustificativa('solta', projetos, mapa), false);
});
