import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AppNotification } from '../types';
import {
  deduplicar, montarItens, montarLinhas, montarLinhasPendentes, periodoDe, descreverNotificacao, desfechoDe,
  type ContextoInbox,
} from './inbox';

let seq = 0;
function notif(p: Partial<AppNotification> & { createdAt: string }): AppNotification {
  return {
    id: `n${++seq}`, userId: 'u1', actorId: 'a1', type: 'status_changed', status: 'unread', message: 'x', ...p,
  } as AppNotification;
}

const ctx: ContextoInbox = {
  tarefas: new Map([['t1', { title: 'CARD | CONVITE TREINAMENTO MRI' }], ['t2', { title: 'Logo Unir no Tapume' }]]),
  titulos: new Map([
    ['s1', { titulo: '292959', status: 'aprovacao_3' }],
    ['s2', { titulo: '287049', status: 'aguardando_pagamento' }],
    ['s3', { titulo: '111', status: 'a_lancar' }],
  ]),
};

test('título de alçada leva o número do título', () => {
  const d = descreverNotificacao(notif({
    createdAt: '2026-11-21T10:00:00', type: 'alcada_pending', siengeTitleId: 's1', targetId: '3',
    message: 'Título aguardando 3ª alçada', details: 'O título "292959" está aguardando sua aprovação.',
  }), ctx);
  assert.equal(d.titulo, 'Título 292959 · 3ª alçada');
  assert.equal(d.descricao, undefined);
});

test('número vem do details quando o título não está carregado', () => {
  const d = descreverNotificacao(notif({
    createdAt: '2026-11-21T10:00:00', type: 'alcada_pending', siengeTitleId: 'xx', targetId: '2',
    message: 'Título aguardando 2ª alçada', details: 'O título "555" está aguardando sua aprovação.',
  }), ctx);
  assert.equal(d.titulo, 'Título 555 · 2ª alçada');
});

test('aprovação de criativo leva o nome da tarefa e descrição redundante some', () => {
  const d = descreverNotificacao(notif({
    createdAt: '2026-11-21T10:00:00', type: 'review_requested', taskId: 't1',
    message: 'Aprovação de Criativo', details: 'Você foi selecionado para aprovar o criativo na tarefa "CARD | CONVITE TREINAMENTO MRI".',
  }), ctx);
  assert.equal(d.titulo, 'Aprovação de criativo · CARD | CONVITE TREINAMENTO MRI');
  assert.equal(d.descricao, undefined);
});

test('menção preserva nome próprio e coloca a tarefa no título', () => {
  const d = descreverNotificacao(notif({
    createdAt: '2026-11-21T10:00:00', type: 'chat_mention', taskId: 't2',
    message: 'João Silva marcou você no chat da tarefa: Logo Unir no Tapume',
  }), ctx);
  assert.equal(d.titulo, 'João Silva marcou você no chat · Logo Unir no Tapume');
});

test('atraso crítico: título com tarefa e dias, ícone de prazo atrasado', () => {
  const d = descreverNotificacao(notif({
    createdAt: '2026-11-21T10:00:00', type: 'deadline', taskId: 't2', targetId: 'critico',
    message: 'Tarefa com atraso crítico', details: '11 dias',
  }), ctx);
  assert.equal(d.titulo, 'Tarefa com atraso crítico · Logo Unir no Tapume · 11 dias');
  assert.equal(d.categoria, 'prazo_atrasado');
});

test('deduplica mesmo tipo + entidade em menos de 10 min (cadeia)', () => {
  const lista = [
    notif({ createdAt: '2026-11-21T10:00:00', type: 'alcada_pending', siengeTitleId: 's2' }),
    notif({ createdAt: '2026-11-21T10:05:00', type: 'alcada_pending', siengeTitleId: 's2' }),
    notif({ createdAt: '2026-11-21T10:12:00', type: 'alcada_pending', siengeTitleId: 's2' }),
    notif({ createdAt: '2026-11-21T10:13:00', type: 'alcada_pending', siengeTitleId: 's2' }),
    notif({ createdAt: '2026-11-21T11:00:00', type: 'alcada_pending', siengeTitleId: 's2' }), // > 10 min: separado
    notif({ createdAt: '2026-11-21T10:01:00', type: 'review_requested', siengeTitleId: 's2' }), // outro tipo
  ];
  const r = deduplicar(lista);
  assert.equal(r.length, 3);
  assert.equal(r[0].n.createdAt, '2026-11-21T11:00:00');
  assert.equal(r[0].ids.length, 1);
  const cadeia = r.find(x => x.ids.length === 4);
  assert.ok(cadeia, 'as 4 em cadeia colapsam');
  assert.equal(cadeia!.n.createdAt, '2026-11-21T10:13:00', 'representante é a mais recente');
});

test('não deduplica entidades diferentes', () => {
  const r = deduplicar([
    notif({ createdAt: '2026-11-21T10:00:00', type: 'review_requested', taskId: 't1' }),
    notif({ createdAt: '2026-11-21T10:00:30', type: 'review_requested', taskId: 't2' }),
  ]);
  assert.equal(r.length, 2);
});

test('períodos: hoje, ontem, esta semana, semana passada, mês', () => {
  const agora = new Date(2026, 10, 21, 15, 0); // sábado 21/11/2026
  assert.equal(periodoDe(new Date(2026, 10, 21, 1), agora).rotulo, 'Hoje');
  assert.equal(periodoDe(new Date(2026, 10, 20, 23), agora).rotulo, 'Ontem');
  assert.equal(periodoDe(new Date(2026, 10, 16, 9), agora).rotulo, 'Esta semana'); // segunda
  assert.equal(periodoDe(new Date(2026, 10, 10, 9), agora).rotulo, 'Semana passada');
  assert.equal(periodoDe(new Date(2026, 9, 3, 9), agora).rotulo, 'Outubro 2026');
});

test('agrupa ≥3 itens do mesmo tipo no mesmo dia, com cabeçalho de período', () => {
  const agora = new Date(2026, 10, 21, 18, 0);
  const lista = [1, 2, 3].map(i => notif({
    createdAt: new Date(2026, 10, 21, 10 + i).toISOString(), type: 'alcada_pending',
    siengeTitleId: `x${i}`, targetId: '3', message: 'Título aguardando 3ª alçada', details: `O título "${i}00" está aguardando`,
  }));
  lista.push(notif({ createdAt: new Date(2026, 10, 21, 9).toISOString(), type: 'chat_mention', taskId: 't1', message: 'Ana marcou você no chat da tarefa: CARD | CONVITE TREINAMENTO MRI' }));
  const linhas = montarLinhas(montarItens(lista, ctx), agora);
  assert.deepEqual(linhas.map(l => l.tipo), ['cabecalho', 'grupo', 'item']);
  const g = linhas[1];
  assert.equal(g.tipo === 'grupo' && g.rotulo, '3 títulos aguardando 3ª alçada');
  assert.equal(g.tipo === 'grupo' && g.itens.length, 3);
});

const critico = (dia: number, id: string) => notif({
  createdAt: new Date(2026, 10, dia, 9).toISOString(), type: 'deadline', targetId: 'critico', taskId: id, message: 'Tarefa com atraso crítico', details: '12 dias',
});

test('atraso crítico vai para "Requer atenção", junto mesmo em dias diferentes', () => {
  const agora = new Date(2026, 10, 21, 18);
  const itens = montarItens([
    critico(21, 'c1'), critico(20, 'c2'), critico(12, 'c3'),
    notif({ createdAt: new Date(2026, 10, 21, 10).toISOString(), type: 'chat_mention', taskId: 't1', message: 'Ana marcou você no chat da tarefa: x' }),
    notif({ createdAt: new Date(2026, 10, 20, 10).toISOString(), type: 'deadline', targetId: '-3d', taskId: 't2', message: 'Prazo Atrasado (3 dias)' }),
  ], ctx);
  const linhas = montarLinhasPendentes(itens, agora);
  assert.deepEqual(linhas.map(l => l.tipo === 'item' ? l.item.n.type : l.rotulo),
    ['Requer atenção', '3× Tarefa com atraso crítico', 'Hoje', 'chat_mention', 'Ontem', 'deadline']);
});

test('"Requer atenção": até 2 críticos aparecem soltos; sem críticos não há seção', () => {
  const agora = new Date(2026, 10, 21, 18);
  const dois = montarLinhasPendentes(montarItens([critico(21, 'd1'), critico(20, 'd2')], ctx), agora);
  assert.deepEqual(dois.map(l => l.tipo), ['cabecalho', 'item', 'item']);
  const nenhum = montarLinhasPendentes(montarItens([notif({ createdAt: new Date(2026, 10, 21, 9).toISOString(), type: 'reminder', taskId: 't1', targetId: 'reminder' })], ctx), agora);
  assert.deepEqual(nenhum.map(l => l.tipo === 'cabecalho' ? l.rotulo : l.tipo), ['Hoje', 'item']);
});

test('2 itens do mesmo tipo não formam grupo', () => {
  const agora = new Date(2026, 10, 21, 18, 0);
  const lista = [1, 2].map(i => notif({ createdAt: new Date(2026, 10, 21, 10 + i).toISOString(), type: 'alcada_pending', siengeTitleId: `y${i}`, targetId: '3', message: 'Título aguardando 3ª alçada' }));
  const linhas = montarLinhas(montarItens(lista, ctx), agora);
  assert.deepEqual(linhas.map(l => l.tipo), ['cabecalho', 'item', 'item']);
});

test('desfecho de alçada segue o status atual do título', () => {
  const [pend, aprov, repr] = montarItens([
    notif({ createdAt: '2026-11-21T10:00:00', type: 'alcada_pending', siengeTitleId: 's1', targetId: '3', message: 'Título aguardando 3ª alçada' }),
    notif({ createdAt: '2026-11-20T10:00:00', type: 'alcada_pending', siengeTitleId: 's2', targetId: '3', message: 'Título aguardando 3ª alçada' }),
    notif({ createdAt: '2026-11-19T10:00:00', type: 'alcada_pending', siengeTitleId: 's3', targetId: '2', message: 'Título aguardando 2ª alçada' }),
  ], ctx);
  assert.equal(desfechoDe(pend, false, ctx), 'pendente');
  assert.equal(desfechoDe(aprov, true, ctx), 'aprovado');
  assert.equal(desfechoDe(repr, true, ctx), 'reprovado');
});
