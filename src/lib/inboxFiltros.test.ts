import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AppNotification } from '../types';
import { TIPO_PARA_CHIP, FILTROS_TIPO, filtroTipoDe, ehAtrasoCritico, passaDesfecho } from './inbox';
import {
  arranjoBarra, casaEscopo, casaPeriodo, chaveNome, desserializarFiltros, ehUrlDaInbox, filtrosPadrao, normalizarFiltros,
  periodoPersonalizado, rotuloPeriodo, serializarFiltros, temFiltros,
  type FiltrosInbox, type VinculosInbox,
} from './inboxFiltros';

const n = (p: Partial<AppNotification>) => ({
  id: 'n', userId: 'u', actorId: 'a', type: 'status_changed', status: 'unread', message: 'x', createdAt: '2026-11-21T10:00:00', ...p,
} as AppNotification);

// ─── Tipo → chip ───

test('todo tipo cai em um dos 4 chips', () => {
  const chips = FILTROS_TIPO.map(f => f.valor);
  assert.deepEqual(chips, ['aprovacoes', 'prazos', 'mencoes', 'atualizacoes']);
  for (const chip of Object.values(TIPO_PARA_CHIP)) assert.ok(chips.includes(chip));
});

test('mapeamento tipo → chip', () => {
  const casos: [Partial<AppNotification>, string][] = [
    [{ type: 'alcada_pending' }, 'aprovacoes'],
    [{ type: 'approval_pending' }, 'aprovacoes'],
    [{ type: 'approved' }, 'aprovacoes'],
    [{ type: 'rejected' }, 'aprovacoes'],
    ...['Criativo', 'Copy', 'Orçamento', 'Documento', 'Proposta', 'Publicação'].map(x =>
      [{ type: 'review_requested', message: `Aprovação de ${x}` }, 'aprovacoes'] as [Partial<AppNotification>, string]),
    [{ type: 'review_requested', message: 'Revisão Solicitada' }, 'atualizacoes'],
    [{ type: 'review_requested', message: 'Em Refação' }, 'atualizacoes'],
    [{ type: 'deadline' }, 'prazos'],
    [{ type: 'reminder' }, 'prazos'],
    [{ type: 'chat_mention' }, 'mencoes'],
    [{ type: 'task_assigned' }, 'atualizacoes'],
    [{ type: 'status_changed' }, 'atualizacoes'],
    [{ type: 'deadline_changed' }, 'atualizacoes'],
    [{ type: 'deadline_change_requested' }, 'atualizacoes'],
    [{ type: 'tipo_novo_do_banco' as AppNotification['type'] }, 'atualizacoes'],
  ];
  for (const [p, esperado] of casos) assert.equal(filtroTipoDe(n(p)), esperado, `${p.type} / ${p.message ?? ''}`);
});

test('atraso crítico: marco novo e antigo, só em prazos', () => {
  assert.equal(ehAtrasoCritico(n({ type: 'deadline', targetId: 'critico' })), true);
  assert.equal(ehAtrasoCritico(n({ type: 'deadline', targetId: '-15d' })), true);
  assert.equal(ehAtrasoCritico(n({ type: 'deadline', targetId: '-3d' })), false);
  assert.equal(ehAtrasoCritico(n({ type: 'reminder', targetId: 'critico' })), false);
});

test('desfecho: resolvidos não inclui aprovado, expirado nem ainda aguardando', () => {
  assert.equal(passaDesfecho('resolvido', 'resolvidos'), true);
  for (const d of ['aprovado', 'reprovado', 'expirado', 'pendente'] as const) assert.equal(passaDesfecho(d, 'resolvidos'), false);
  assert.equal(passaDesfecho('expirado', 'todos'), true);
});

const base = filtrosPadrao('pendentes');

// ─── Escopo ───

const v: VinculosInbox = {
  empreendimentoDaTarefa: new Map([['t1', 'e1'], ['t2', 'e2']]),
  empreendimentoDoTitulo: new Map([['s1', ' gênova ']]),
  empreendimentoPorNome: new Map([[chaveNome('Gênova'), 'e1']]),
  projetoDaTarefa: { t1: 'p1', t2: 'p2' },
};
const escopo = (p: Partial<FiltrosInbox>) => ({ ...base, ...p });

test('empreendimento inclui títulos financeiros pelo nome', () => {
  const titulo = n({ type: 'alcada_pending', siengeTitleId: 's1' });
  assert.equal(casaEscopo(titulo, escopo({ empreendimentos: ['e1'] }), v), true);
  assert.equal(casaEscopo(titulo, escopo({ empreendimentos: ['e2'] }), v), false);
});

test('projeto esconde notificações sem tarefa', () => {
  const titulo = n({ type: 'alcada_pending', siengeTitleId: 's1' });
  assert.equal(casaEscopo(titulo, escopo({ projetos: ['p1'] }), v), false);
  assert.equal(casaEscopo(n({ taskId: 't1' }), escopo({ projetos: ['p1'] }), v), true);
  assert.equal(casaEscopo(n({ taskId: 't2' }), escopo({ projetos: ['p1'] }), v), false);
});

test('empreendimento e projeto se combinam com E', () => {
  assert.equal(casaEscopo(n({ taskId: 't1' }), escopo({ empreendimentos: ['e1'], projetos: ['p1'] }), v), true);
  assert.equal(casaEscopo(n({ taskId: 't1' }), escopo({ empreendimentos: ['e2'], projetos: ['p1'] }), v), false);
});

// ─── Período ───

const agora = new Date(2026, 10, 21, 15, 0);
const em = (a: number, m: number, d: number, h = 12) => new Date(a, m - 1, d, h).toISOString();

test('período: presets', () => {
  assert.equal(casaPeriodo(em(2026, 11, 21, 0), { preset: 'hoje' }, agora), true);
  assert.equal(casaPeriodo(em(2026, 11, 20, 23), { preset: 'hoje' }, agora), false);
  assert.equal(casaPeriodo(em(2026, 11, 15), { preset: '7d' }, agora), true);
  assert.equal(casaPeriodo(em(2026, 11, 14), { preset: '7d' }, agora), false);
  assert.equal(casaPeriodo(em(2026, 10, 31), { preset: 'mes' }, agora), false);
  assert.equal(casaPeriodo(em(2026, 10, 1, 0), { preset: 'mes-passado' }, agora), true);
  assert.equal(casaPeriodo(em(2026, 10, 31, 23), { preset: 'mes-passado' }, agora), true);
  assert.equal(casaPeriodo(em(2026, 11, 1, 0), { preset: 'mes-passado' }, agora), false);
});

test('período: mês passado em janeiro volta para dezembro', () => {
  assert.equal(casaPeriodo(em(2026, 12, 15), { preset: 'mes-passado' }, new Date(2027, 0, 5)), true);
});

test('período: adiada (created_at no futuro) não some nos presets abertos', () => {
  assert.equal(casaPeriodo(em(2026, 11, 22), { preset: 'hoje' }, agora), true);
});

test('período personalizado: inclusivo, ordena as pontas e formata', () => {
  const p = periodoPersonalizado('2026-11-15', '2026-11-01');
  assert.equal(casaPeriodo(em(2026, 11, 1, 0), p, agora), true);
  assert.equal(casaPeriodo(em(2026, 11, 15, 23), p, agora), true);
  assert.equal(casaPeriodo(em(2026, 11, 16, 0), p, agora), false);
  assert.equal(rotuloPeriodo(p), '01/11 – 15/11');
  assert.equal(rotuloPeriodo(periodoPersonalizado('2025-12-20', '2026-01-05')), '20/12/2025 – 05/01/2026');
});

// ─── URL e persistência ───

test('URL: ida e volta preserva todos os filtros', () => {
  const f: FiltrosInbox = {
    busca: 'convite & "MRI"', periodo: { preset: '7d' }, empreendimentos: ['e1', 'e2'], projetos: ['45'],
    tipos: ['prazos'], desfecho: 'aprovados',
  };
  const url = serializarFiltros('historico', f);
  assert.match(url, /periodo=7d&empreendimento=e1,e2&projeto=45&tipo=prazos/);
  assert.deepEqual(desserializarFiltros(url), { aba: 'historico', filtros: f });
});

test('URL: padrão fica enxuta e padrão difere por aba', () => {
  assert.equal(serializarFiltros('pendentes', filtrosPadrao('pendentes')), '?tela=inbox&aba=pendentes');
  assert.equal(serializarFiltros('historico', filtrosPadrao('historico')), '?tela=inbox&aba=historico');
  assert.match(serializarFiltros('pendentes', { ...base, periodo: { preset: '30d' } }), /periodo=30d/);
  assert.match(serializarFiltros('historico', { ...filtrosPadrao('historico'), periodo: { preset: 'todo' } }), /periodo=todo/);
});

test('URL: intervalo personalizado', () => {
  const f = { ...base, periodo: periodoPersonalizado('2026-11-01', '2026-11-15') };
  const url = serializarFiltros('pendentes', f);
  assert.match(url, /periodo=2026-11-01_2026-11-15/);
  assert.deepEqual(desserializarFiltros(url)!.filtros.periodo, f.periodo);
});

test('URL: valores inválidos caem no padrão', () => {
  const r = desserializarFiltros('?tela=inbox&aba=x&periodo=2026-02-31_2026-03-01&tipo=aprovacoes,nada,aprovacoes&desfecho=aprovados')!;
  assert.equal(r.aba, 'pendentes');
  assert.deepEqual(r.filtros.periodo, { preset: 'todo' });
  assert.deepEqual(r.filtros.tipos, ['aprovacoes']);
  assert.equal(r.filtros.desfecho, 'todos', 'desfecho não existe em Pendentes');
});

test('URL: sem estado devolve null (usa a última combinação salva)', () => {
  assert.equal(desserializarFiltros('?tela=inbox'), null);
  assert.equal(desserializarFiltros('?periodo=7d'), null);
  assert.equal(ehUrlDaInbox('?tela=inbox'), true);
  assert.equal(ehUrlDaInbox(''), false);
});

test('persistência: corrompido cai no padrão', () => {
  assert.deepEqual(normalizarFiltros('lixo', 'historico'), filtrosPadrao('historico'));
  const r = normalizarFiltros({ tipos: ['prazos', 1, 'x'], periodo: '7d', empreendimentos: 'e1', desfecho: 'zzz' }, 'historico');
  assert.deepEqual(r, { ...filtrosPadrao('historico'), tipos: ['prazos'], periodo: { preset: '7d' } });
});

test('temFiltros compara com o padrão da aba', () => {
  assert.equal(temFiltros(filtrosPadrao('historico'), 'historico'), false);
  assert.equal(temFiltros(filtrosPadrao('historico'), 'pendentes'), true, '30 dias não é o padrão de Pendentes');
  assert.equal(temFiltros({ ...base, busca: '  ' }, 'pendentes'), false);
});

const medidas = { modo: 270, periodo: 180, escopo: [190, 130], filtros: 100, limpar: 60 };

test('barra: recolhe Projeto → Empreendimento antes de mexer no toggle', () => {
  // 2: 295 + 180+190+130+60 + 24 = 879 · 1: 295+530+24 = 849 · 0: 295+340+16 = 651
  assert.deepEqual(arranjoBarra(medidas, 879), { visiveis: 2, modoEmLinhaPropria: false });
  assert.deepEqual(arranjoBarra(medidas, 878), { visiveis: 1, modoEmLinhaPropria: false });
  assert.deepEqual(arranjoBarra(medidas, 651), { visiveis: 0, modoEmLinhaPropria: false });
});

test('barra: sem espaço, o toggle ganha a primeira linha e os filtros aproveitam a segunda', () => {
  assert.deepEqual(arranjoBarra(medidas, 600), { visiveis: 2, modoEmLinhaPropria: true });
  assert.deepEqual(arranjoBarra(medidas, 560), { visiveis: 1, modoEmLinhaPropria: true });
  assert.deepEqual(arranjoBarra(medidas, 360), { visiveis: 0, modoEmLinhaPropria: true });
  assert.deepEqual(arranjoBarra(medidas, 0), { visiveis: 0, modoEmLinhaPropria: true });
});

test('URL: link antigo com vários tipos fica com a primeira aba', () => {
  assert.deepEqual(desserializarFiltros('?tela=inbox&aba=pendentes&tipo=prazos,aprovacoes')!.filtros.tipos, ['aprovacoes']);
});
