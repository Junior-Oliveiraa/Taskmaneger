import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelar, criativosAprovados, editarCriativo, entregaDoTexto, enviarCriativo, enviar, pendentesSemTexto, resolver, rodadasDe, situacaoDe, textoTravado, tudoAprovado } from './aprovacao';
import type { Delivery } from '../types';

const A = { id: 'a', name: 'Legenda', content: '<p>v1</p>' };
const B = { id: 'b', name: 'Headline', content: '<p>h</p>' };
const bruno = { id: 'u2', name: 'Bruno' };
const ana = { id: 'u1', name: 'Ana' };
const h = (n: number) => `2026-11-22T1${n}:00:00.000Z`;

test('reprovar e reenviar até aprovar fica tudo na mesma entrega', () => {
  const e1 = enviar([], A, 'u1', bruno, h(0))!;
  assert.equal(situacaoDe(e1.entregas[0]), 'pendente');
  assert.ok(textoTravado(e1.entregas, A));
  assert.equal(enviar(e1.entregas, A, 'u1', bruno), null);

  assert.equal(resolver(e1.entregas, e1.id, 'rejected', '  ', ana), null);
  const r = resolver(e1.entregas, e1.id, 'rejected', ' Falta a chamada ', ana, h(1))!;
  assert.equal(situacaoDe(r[0]), 'reprovado');
  assert.ok(!textoTravado(r, A));
  assert.equal(resolver(r, e1.id, 'approved', '', ana), null);

  const e2 = enviar(r, { ...A, content: '<p>v2</p>' }, 'u3', bruno, h(2))!;
  assert.equal(e2.id, e1.id);
  assert.equal(e2.entregas.length, 1);
  const ok = resolver(e2.entregas, e2.id, 'approved', '', { id: 'u3', name: 'Carla' }, h(3))!;
  assert.ok(textoTravado(ok, A));
  assert.ok(tudoAprovado(ok, [A, B]));

  assert.deepEqual(rodadasDe(ok).map(x => [x.numero, x.resultado, x.html, x.aprovadorId, x.enviadoEm, x.resolvidoEm, x.resolvidoPor, x.justificativa]), [
    [2, 'aprovado', '<p>v2</p>', 'u3', h(2), h(3), 'Carla', undefined],
    [1, 'reprovado', '<p>v1</p>', 'u1', h(0), h(1), 'Ana', 'Falta a chamada'],
  ]);
});

test('a tarefa só fica toda aprovada quando nenhum texto enviado está em aberto', () => {
  let e = enviar([], A, 'u1', bruno, h(0))!;
  const idA = e.id;
  e = enviar(e.entregas, B, 'u1', bruno, h(1))!;
  const umOk = resolver(e.entregas, idA, 'approved', '', ana, h(2))!;
  assert.ok(!tudoAprovado(umOk, [A, B]));
  assert.ok(tudoAprovado(resolver(umOk, e.id, 'approved', '', ana, h(3))!, [A, B]));
});

test('cancelar devolve o texto; depois de reprovado ele continua reprovado', () => {
  const e = enviar([], A, 'u1', bruno, h(0))!;
  const c = cancelar(e.entregas, e.id, bruno, h(1))!;
  assert.equal(situacaoDe(c[0]), 'livre');
  assert.ok(!textoTravado(c, A));
  assert.equal(rodadasDe(c)[0].resultado, 'cancelado');
  assert.equal(cancelar(c, e.id, bruno), null);

  const r = resolver(e.entregas, e.id, 'rejected', 'x', ana, h(1))!;
  const r2 = cancelar(enviar(r, A, 'u1', bruno, h(2))!.entregas, e.id, bruno, h(3))!;
  assert.equal(situacaoDe(r2[0]), 'reprovado');
});

test('entregas antigas: ligadas pelo nome, com comentários e mensagens automáticas', () => {
  const antiga: Delivery = {
    id: 'd1', status: 'pending', approverId: 'u1', createdAt: h(0),
    thread: [
      { id: 'm1', role: 'designer', type: 'submission', content: 'Nova entrega de copy', copyText: '<p>v1</p>', editorName: 'Legenda', authorName: 'Bruno', createdAt: h(0) },
      { id: 'm2', role: 'manager', type: 'feedback', action: 'rejected', content: 'Reprovado sem justificativa', editorName: 'Ana', createdAt: h(1) },
      { id: 'm3', role: 'designer', type: 'reply', action: 'will_rework', content: 'Vou refazer a arte.', createdAt: h(2) },
      { id: 'm4', role: 'designer', type: 'submission', content: 'Mudei o fim', copyText: '<p>v2</p>', editorName: 'Legenda', authorName: 'Bruno', createdAt: h(3) },
      { id: 'm5', role: 'manager', type: 'chat', content: 'E a praia?', copyText: 'v2', authorName: 'Ana', createdAt: h(4) },
    ],
  };
  assert.equal(entregaDoTexto([antiga], A)?.id, 'd1');
  const [r2, r1] = rodadasDe([antiga]);
  assert.deepEqual([r1.resultado, r1.resolvidoPor, r1.justificativa, r1.comentarios.length], ['reprovado', 'Ana', undefined, 0]);
  assert.deepEqual([r2.resultado, r2.aprovadorId, r2.comentarios.map(c => c.texto)], ['pendente', 'u1', ['Mudei o fim', 'E a praia?']]);
  // Texto excluído ou renomeado: a decisão ainda precisa aparecer em algum lugar.
  assert.equal(pendentesSemTexto([antiga], [{ ...A, name: 'Outro' }]).length, 1);
  assert.ok(!tudoAprovado([antiga], [B]));
});

test('revisão pedida sem novo envio vira outra rodada do mesmo texto', () => {
  const d: Delivery = {
    id: 'd1', status: 'approved', approverId: 'u1', createdAt: h(0),
    thread: [
      { id: 'm1', role: 'designer', type: 'submission', content: '', copyText: '<p>v1</p>', editorName: 'Legenda', createdAt: h(0) },
      { id: 'm2', role: 'manager', type: 'feedback', action: 'rejected', content: 'Curto', createdAt: h(1) },
      { id: 'm3', role: 'designer', type: 'reply', action: 'request_review', content: 'É de propósito', createdAt: h(2) },
      { id: 'm4', role: 'manager', type: 'feedback', action: 'approved', content: 'Aprovado!', createdAt: h(3) },
    ],
  };
  assert.deepEqual(rodadasDe([d]).map(r => [r.nome, r.html, r.resultado, r.enviadoEm, r.comentarios[0]?.texto]), [
    ['Legenda', '<p>v1</p>', 'aprovado', h(2), 'É de propósito'],
    ['Legenda', '<p>v1</p>', 'reprovado', h(0), undefined],
  ]);
});

test('criativo: rascunho, envio, reprovação com rabisco e nova versão', () => {
  const nome = (d: Delivery) => d.name || 'Criativo 1';
  const rascunho: Delivery = { id: 'c1', status: 'draft', thread: [], createdAt: h(0) };
  assert.equal(situacaoDe(rascunho), 'livre');
  assert.equal(enviarCriativo([rascunho], 'c1', 'u1', bruno), null); // sem imagem
  const comImg = editarCriativo([rascunho], 'c1', () => ({ imageUrls: ['a.png'] }))!;
  const e1 = enviarCriativo(comImg, 'c1', 'u1', bruno, h(1))!;
  assert.equal(editarCriativo(e1, 'c1', () => ({ imageUrls: [] })), null);
  const r1 = resolver(e1, 'c1', 'rejected', 'Logo maior', ana, h(2), ['', 'a-rabisco.png'])!;
  const e2 = enviarCriativo(editarCriativo(r1, 'c1', () => ({ imageUrls: ['b.png', 'c.png'] }))!, 'c1', 'u1', bruno, h(3))!;
  const ok = resolver(e2, 'c1', 'approved', '', ana, h(4))!;
  assert.ok(criativosAprovados([...ok, { ...rascunho, id: 'c2' }]));
  assert.ok(!criativosAprovados([rascunho]));
  assert.deepEqual(rodadasDe(ok, nome).map(r => [r.nome, r.numero, r.resultado, r.imagens, r.anotadas, r.justificativa]), [
    ['Criativo 1', 2, 'aprovado', ['b.png', 'c.png'], [], undefined],
    ['Criativo 1', 1, 'reprovado', ['a.png'], ['a-rabisco.png'], 'Logo maior'],
  ]);
});

test('criativo antigo sem imagem no envio: a arte é registrada antes de ser trocada', () => {
  const antigo: Delivery = {
    id: 'c1', status: 'rejected', approverId: 'u1', createdAt: h(0), imageUrl: 'v1.png', imageUrls: ['v1.png'],
    thread: [
      { id: 'm1', role: 'designer', type: 'submission', content: 'Nova entrega', authorName: 'Bruno', createdAt: h(0) },
      { id: 'm2', role: 'manager', type: 'feedback', action: 'rejected', content: 'Curto', editorName: 'Ana', createdAt: h(1) },
    ],
  };
  const novo = editarCriativo([antigo], 'c1', () => ({ imageUrl: 'v2.png', imageUrls: ['v2.png'] }))!;
  assert.deepEqual(rodadasDe(novo, () => 'X')[0].imagens, ['v1.png']);
  assert.deepEqual(novo[0].imageUrls, ['v2.png']);
});
