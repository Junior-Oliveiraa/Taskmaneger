import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Link2, MoreHorizontal, Pencil, Plus, RefreshCw, Save, Trash2, Undo2 } from 'lucide-react';
import {
  AlteracaoMeta, EmpreendimentoCv, MetaEmpreendimento, MetasComercial as Metas, ROTULO_FAIXA,
  atualizarEmpreendimentoMeta, criarEmpreendimentoMeta, fetchMetasComercial, idCvDaMeta,
  removerEmpreendimentoMeta, salvarFatorSuper, salvarMetas,
} from '../../lib/comercialMetas';
import { fetchCvComercial, hojeBrasilia, nomeCurtoEmpreendimento } from '../../lib/cvComercial';
import { fetchProjects } from '../../lib/api';
import { BOTAO_FILTRO, BOTAO_FILTRO_NEUTRO, MENU_FILTRO } from './filtroEstilo';

// ── Formatação e leitura ─────────────────────────────────────────────────────

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtMoeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtFator = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const chave = (emp: string, mes: string) => `${emp}\u0000${mes}`;
const mesDe = (ano: number, i: number) => `${ano}-${String(i + 1).padStart(2, '0')}`;

/**
 * Lê o que foi digitado ou colado do Excel: "6.150.000", "6150000", "6,15 mi",
 * "R$ 420.000,00". Vazio, "-" ou zero apagam a meta (null).
 */
function lerValor(bruto: string): number | null | 'invalido' {
  let t = bruto.replace(/r\$/i, '').replace(/\s+/g, '').toLowerCase();
  if (t === '' || /^[-–—]+$/.test(t)) return null;
  let mult = 1;
  if (t.endsWith('mi')) { mult = 1e6; t = t.slice(0, -2); }
  else if (t.endsWith('mil')) { mult = 1e3; t = t.slice(0, -3); }
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return 'invalido';
  const v = Math.round(Number(t) * mult * 100) / 100;
  return v === 0 ? null : v;
}

// ── Célula editável ──────────────────────────────────────────────────────────

function CelulaMeta({ valor, alterado, linha, coluna, rotulo, onAlterar, onColar }: {
  valor: number | null; alterado: boolean; linha: number; coluna: number; rotulo: string;
  onAlterar: (v: number | null) => void; onColar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const [invalido, setInvalido] = useState(false);
  const ignorarBlur = useRef(false);

  const focar = (l: number, c: number) =>
    (document.querySelector(`[data-celula-meta="${l}:${c}"]`) as HTMLInputElement | null)?.focus();

  const confirmar = () => {
    if (texto === null) return;
    const v = lerValor(texto);
    if (v === 'invalido') { setInvalido(true); return; }
    setInvalido(false);
    if (v !== valor) onAlterar(v);
  };

  return (
    <input
      data-celula-meta={`${linha}:${coluna}`}
      aria-label={rotulo}
      inputMode="decimal"
      autoComplete="off"
      value={texto ?? (valor ? fmtNum(valor) : '')}
      placeholder="–"
      onFocus={e => { setTexto(valor ? fmtNum(valor) : ''); const el = e.currentTarget; requestAnimationFrame(() => el.select()); }}
      onChange={e => { setTexto(e.target.value); setInvalido(false); }}
      onBlur={() => {
        if (ignorarBlur.current) { ignorarBlur.current = false; setTexto(null); return; }
        confirmar();
        setTexto(null);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          confirmar();
          focar(linha + (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey) ? -1 : 1), coluna);
        } else if (e.key === 'Escape') {
          ignorarBlur.current = true;
          setInvalido(false);
          e.currentTarget.blur();
        }
      }}
      onPaste={e => {
        const t = e.clipboardData.getData('text');
        if (!/[\t\n]/.test(t.replace(/\r?\n$/, ''))) return;
        e.preventDefault();
        ignorarBlur.current = true;
        e.currentTarget.blur();
        onColar(t);
      }}
      title={invalido ? 'Valor inválido: use números, por exemplo 6.150.000' : undefined}
      className={`w-full min-w-[104px] h-8 px-2 text-right text-xs tabular-nums rounded-md border outline-none transition-colors
        placeholder:text-zinc-700 focus:bg-zinc-900 focus:border-blue-500/70 focus:text-zinc-100
        ${invalido ? 'border-red-500/70 bg-red-500/10 text-red-300'
          : alterado ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          : 'border-transparent bg-transparent text-zinc-300 hover:border-zinc-800'}`}
    />
  );
}

// ── Menu do empreendimento (renomear, vincular ao CV, mover, remover) ───────

function MenuEmpreendimento({ emp, nomesExistentes, cv, projetos, idVinculado, podeEsquerda, podeDireita, onMover, onFechar }: {
  emp: MetaEmpreendimento; nomesExistentes: string[]; cv: EmpreendimentoCv[]; projetos: { id: string; name: string }[]; idVinculado: number | null;
  podeEsquerda: boolean; podeDireita: boolean; onMover: (dir: -1 | 1) => void; onFechar: () => void;
}) {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const [nome, setNome] = useState(emp.nome);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onFechar(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [onFechar]);

  const atualizar = useMutation({
    mutationFn: (m: Parameters<typeof atualizarEmpreendimentoMeta>[1]) => atualizarEmpreendimentoMeta(emp.nome, m),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comercialMetas'] }),
    onError: (e: any) => setErro(e?.message ?? 'Não foi possível salvar.'),
  });
  const remover = useMutation({
    mutationFn: () => removerEmpreendimentoMeta(emp.nome),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['comercialMetas'] }); onFechar(); },
    onError: (e: any) => setErro(e?.message ?? 'Não foi possível remover.'),
  });

  const renomear = () => {
    const n = nome.trim();
    if (!n || n === emp.nome) return;
    if (nomesExistentes.some(x => x.toLowerCase() === n.toLowerCase() && x !== emp.nome)) { setErro('Já existe um empreendimento com esse nome.'); return; }
    atualizar.mutate({ nome: n }, { onSuccess: onFechar });
  };

  const rotulo = 'block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1';
  const campo = 'w-full h-8 px-2 text-xs text-zinc-100 bg-zinc-900 border border-zinc-800 rounded-md outline-none focus:border-blue-500/70';

  return (
    <div ref={ref} role="dialog" aria-label={`Configurar ${emp.nome}`} className={`${MENU_FILTRO} w-64 p-3 flex flex-col gap-3 text-left normal-case`}>
      <div>
        <label className={rotulo} htmlFor={`renomear-${emp.nome}`}>Nome</label>
        <div className="flex gap-1.5">
          <input id={`renomear-${emp.nome}`} value={nome} onChange={e => { setNome(e.target.value); setErro(null); }}
            onKeyDown={e => { if (e.key === 'Enter') renomear(); }} className={campo} />
          <button type="button" onClick={renomear} disabled={!nome.trim() || nome.trim() === emp.nome || atualizar.isPending}
            className="shrink-0 h-8 px-2 rounded-md bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40" aria-label="Salvar nome">
            <Pencil size={13} />
          </button>
        </div>
      </div>

      <div>
        <label className={rotulo} htmlFor={`cv-${emp.nome}`}>Empreendimento no CV CRM</label>
        <select
          id={`cv-${emp.nome}`}
          value={emp.cv_idempreendimento ?? ''}
          onChange={e => atualizar.mutate({ cv_idempreendimento: e.target.value === '' ? null : Number(e.target.value) })}
          className={campo}
        >
          <option value="">Automático, pelo nome</option>
          {cv.map(c => <option key={c.id} value={c.id}>{nomeCurtoEmpreendimento(c.nome).nome}</option>)}
        </select>
        <p className="text-[10px] text-zinc-500 mt-1">
          {idVinculado !== null
            ? <>Comparado com as vendas de <span className="text-zinc-300">{nomeCurtoEmpreendimento(cv.find(c => c.id === idVinculado)?.nome ?? '').nome || `#${idVinculado}`}</span>.</>
            : 'Sem vínculo: a meta só entra no total de “Todos” no Desempenho.'}
        </p>
      </div>

      <div>
        <label className={rotulo} htmlFor={`orbit-${emp.nome}`}>Empreendimento no Orbit (Finanças)</label>
        <select
          id={`orbit-${emp.nome}`}
          value={emp.project_id ?? ''}
          onChange={e => atualizar.mutate({ project_id: e.target.value === '' ? null : e.target.value })}
          className={campo}
        >
          <option value="">Nenhum</option>
          {projetos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <p className="text-[10px] text-zinc-500 mt-1">
          {emp.project_id
            ? 'Esta meta gera o orçamento deste empreendimento no Dashboard Analítico.'
            : 'Sem vínculo: a meta não aparece no Dashboard Analítico.'}
        </p>
      </div>

      <div className="flex gap-1.5">
        <button type="button" disabled={!podeEsquerda} onClick={() => onMover(-1)} className={`${BOTAO_FILTRO_NEUTRO} h-8 flex-1 justify-center disabled:opacity-40`}>
          <ArrowLeft size={13} /> Mover
        </button>
        <button type="button" disabled={!podeDireita} onClick={() => onMover(1)} className={`${BOTAO_FILTRO_NEUTRO} h-8 flex-1 justify-center disabled:opacity-40`}>
          Mover <ArrowRight size={13} />
        </button>
      </div>

      {confirmarRemocao ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2">
          <p className="text-[11px] text-red-200">Remover {emp.nome} e as metas dele em todos os anos?</p>
          <div className="flex gap-1.5 mt-2">
            <button type="button" onClick={() => remover.mutate()} disabled={remover.isPending}
              className="h-7 px-2 text-[11px] font-semibold rounded-md bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-50">Remover</button>
            <button type="button" onClick={() => setConfirmarRemocao(false)}
              className="h-7 px-2 text-[11px] font-semibold rounded-md text-zinc-300 hover:bg-zinc-800">Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmarRemocao(true)}
          className="inline-flex items-center gap-1.5 self-start text-[11px] font-semibold text-red-400 hover:text-red-300">
          <Trash2 size={13} /> Remover empreendimento
        </button>
      )}

      {erro && <p role="alert" className="text-[11px] text-red-400">{erro}</p>}
    </div>
  );
}

// ── Tela ─────────────────────────────────────────────────────────────────────

type Visao = 'meta' | 'super';

function Resumo({ titulo, meses, meta, fator }: { titulo: string; meses: string; meta: number; fator: number }) {
  return (
    <div className="min-w-0 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5">
      <p className="text-[11px] font-medium text-zinc-400">{titulo} <span className="font-normal text-zinc-600">· {meses}</span></p>
      <p className="text-sm font-bold text-zinc-100 tabular-nums mt-0.5 truncate">{meta ? fmtMoeda(meta) : '–'}</p>
      <p className="text-[11px] text-zinc-500 tabular-nums truncate">Super {meta ? fmtMoeda(meta * fator) : '–'}</p>
    </div>
  );
}

function PainelMetas({ metas, cv, projetos }: { metas: Metas; cv: EmpreendimentoCv[]; projetos: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [ano, setAno] = useState(() => Number(hojeBrasilia().slice(0, 4)));
  const [visao, setVisao] = useState<Visao>('meta');
  const [rascunho, setRascunho] = useState<Map<string, number | null>>(new Map());
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [fatorTexto, setFatorTexto] = useState<string | null>(null);

  const emps = metas.empreendimentos;
  const fator = metas.fatorSuper;
  const meses = useMemo(() => MESES.map((_, i) => mesDe(ano, i)), [ano]);

  const salvo = (emp: string, mes: string) => metas.valores.get(emp)?.get(mes) ?? null;
  const valor = (emp: string, mes: string) => {
    const k = chave(emp, mes);
    return rascunho.has(k) ? rascunho.get(k)! : salvo(emp, mes);
  };

  const alterar = (emp: string, mes: string, v: number | null) => {
    setRascunho(prev => {
      const next = new Map(prev);
      if (v === salvo(emp, mes)) next.delete(chave(emp, mes)); else next.set(chave(emp, mes), v);
      return next;
    });
  };

  // Bloco colado do Excel: linhas = meses, colunas = empreendimentos, a partir da célula.
  const colar = (linha: number, coluna: number, texto: string) => {
    const linhas = texto.replace(/\r/g, '').replace(/\n$/, '').split('\n');
    setRascunho(prev => {
      const next = new Map(prev);
      linhas.forEach((l, i) => {
        const mes = meses[linha + i];
        if (!mes) return;
        l.split('\t').forEach((cel, j) => {
          const emp = emps[coluna + j];
          if (!emp) return;
          const v = lerValor(cel);
          if (v === 'invalido') return;
          if (v === salvo(emp.nome, mes)) next.delete(chave(emp.nome, mes)); else next.set(chave(emp.nome, mes), v);
        });
      });
      return next;
    });
  };

  const pendentes = rascunho.size;
  useEffect(() => {
    if (!pendentes) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [pendentes]);

  const salvar = useMutation({
    mutationFn: () => salvarMetas([...rascunho.entries()].map(([k, v]): AlteracaoMeta => {
      const [empreendimento, mes] = k.split('\u0000');
      return { empreendimento, mes, valor: v };
    })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['comercialMetas'] });
      setRascunho(new Map());
      setErro(null);
    },
    onError: (e: any) => setErro(e?.message ?? 'Não foi possível salvar as metas.'),
  });

  const criar = useMutation({
    mutationFn: (nome: string) => criarEmpreendimentoMeta(nome, (emps[emps.length - 1]?.ordem ?? 0) + 1),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['comercialMetas'] }); setNovoNome(null); setErro(null); },
    onError: (e: any) => setErro(e?.message ?? 'Não foi possível adicionar o empreendimento.'),
  });
  const adicionar = () => {
    const n = (novoNome ?? '').trim();
    if (!n) return;
    if (emps.some(e => e.nome.toLowerCase() === n.toLowerCase())) { setErro(`${n} já está na tabela.`); return; }
    criar.mutate(n);
  };

  // Mover troca a ordem com o vizinho; regrava as ordens para não haver empate.
  const mover = useMutation({
    mutationFn: async ({ i, dir }: { i: number; dir: -1 | 1 }) => {
      const lista = [...emps];
      [lista[i], lista[i + dir]] = [lista[i + dir], lista[i]];
      await Promise.all(lista.map((e, idx) => e.ordem === idx + 1 ? null : atualizarEmpreendimentoMeta(e.nome, { ordem: idx + 1 })));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comercialMetas'] }),
    onError: (e: any) => setErro(e?.message ?? 'Não foi possível mover.'),
  });

  const fatorMut = useMutation({
    mutationFn: salvarFatorSuper,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comercialMetas'] }),
    onError: (e: any) => setErro(e?.message ?? 'Não foi possível salvar o fator.'),
  });
  const confirmarFator = () => {
    if (fatorTexto === null) return;
    const v = Number(fatorTexto.replace(',', '.'));
    setFatorTexto(null);
    if (!Number.isFinite(v) || v <= 1) { setErro('O fator da Super Meta precisa ser maior que 1.'); return; }
    if (v !== fator) fatorMut.mutate(v);
  };

  // Totais do ano (com o rascunho aplicado).
  const totalMes = meses.map(m => emps.reduce((t, e) => t + (valor(e.nome, m) ?? 0), 0));
  const totalEmp = emps.map(e => meses.reduce((t, m) => t + (valor(e.nome, m) ?? 0), 0));
  const soma = (de: number, ate: number) => totalMes.slice(de, ate).reduce((a, b) => a + b, 0);
  const totalAno = soma(0, 12);
  const multiplicador = visao === 'super' ? fator : 1;
  const anosComMeta = useMemo(() => {
    const s = new Set<number>();
    metas.valores.forEach(porMes => porMes.forEach((_, mes) => s.add(Number(mes.slice(0, 4)))));
    return s;
  }, [metas.valores]);
  const idsCv = useMemo(() => new Map(emps.map(e => [e.nome, idCvDaMeta(e, cv)])), [emps, cv]);

  const th = 'px-2 py-2 text-[11px] font-semibold text-zinc-400 whitespace-nowrap border-b border-zinc-800';
  const colTotal = 'px-3 text-right text-xs tabular-nums whitespace-nowrap font-semibold';

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      {/* Barra: ano, visão, fator e salvar */}
      <div className="sticky top-0 z-30 view-pad-x py-2.5 bg-[#08080a]/95 backdrop-blur border-b border-zinc-900/80 flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center h-9 rounded-lg border border-zinc-800 bg-zinc-900/60">
          <button type="button" aria-label="Ano anterior" onClick={() => setAno(a => a - 1)} className="h-full px-2 text-zinc-400 hover:text-zinc-100"><ChevronLeft size={15} /></button>
          <span className="px-2 text-xs font-bold text-zinc-100 tabular-nums" aria-live="polite">{ano}</span>
          <button type="button" aria-label="Próximo ano" onClick={() => setAno(a => a + 1)} className="h-full px-2 text-zinc-400 hover:text-zinc-100"><ChevronRight size={15} /></button>
        </div>
        {[...anosComMeta].sort().filter(a => a !== ano).length > 0 && (
          <div className="hidden md:flex items-center gap-1" aria-label="Anos com metas">
            {[...anosComMeta].sort().map(a => (
              <button key={a} type="button" onClick={() => setAno(a)} aria-pressed={a === ano}
                className={`h-7 px-2 text-[11px] font-semibold rounded-md ${a === ano ? 'text-zinc-100 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-200'}`}>{a}</button>
            ))}
          </div>
        )}

        <span className="hidden sm:block w-px h-5 bg-zinc-800 mx-1" aria-hidden />

        <div role="tablist" aria-label="Visão" className="inline-flex gap-1">
          {(['meta', 'super'] as Visao[]).map(v => (
            <button key={v} type="button" role="tab" aria-selected={visao === v} onClick={() => setVisao(v)}
              className={visao === v ? BOTAO_FILTRO : BOTAO_FILTRO_NEUTRO}>
              {v === 'meta' ? 'Meta' : 'Super Meta'}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-zinc-800 bg-zinc-900/60 text-[11px] text-zinc-400">
          Super Meta = Meta ×
          <input
            aria-label="Fator da Super Meta"
            inputMode="decimal"
            value={fatorTexto ?? fmtFator(fator)}
            onFocus={() => setFatorTexto(fmtFator(fator))}
            onChange={e => setFatorTexto(e.target.value)}
            onBlur={confirmarFator}
            onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
            className="w-12 h-6 px-1.5 text-center text-xs font-semibold text-zinc-100 bg-zinc-950 border border-zinc-800 rounded outline-none focus:border-blue-500/70"
          />
        </label>

        <div className="ml-auto flex items-center gap-2">
          {pendentes > 0 && (
            <>
              <span className="text-[11px] text-amber-400">{pendentes} {pendentes === 1 ? 'alteração não salva' : 'alterações não salvas'}</span>
              <button type="button" onClick={() => { setRascunho(new Map()); setErro(null); }} className={BOTAO_FILTRO_NEUTRO}>
                <Undo2 size={13} /> Descartar
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => salvar.mutate()}
            disabled={!pendentes || salvar.isPending}
            className="h-9 inline-flex items-center gap-2 px-3 text-[11px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 transition-colors"
          >
            {salvar.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />} Salvar
          </button>
        </div>
      </div>

      <div className="view-pad-x view-pad-y flex flex-col gap-3">
        {erro && (
          <p role="alert" className="flex items-center gap-2 text-xs text-red-300 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            <AlertTriangle size={14} /> {erro}
          </p>
        )}

        {/* Mesmo ano somado de três jeitos: em trimestres, em semestres e inteiro. */}
        <div className="grid grid-cols-1 xl:grid-cols-[4fr_2fr_1fr] gap-x-4 gap-y-3">
          <section aria-label="Metas por trimestre">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Por trimestre</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Resumo titulo="1º tri" meses="jan–mar" meta={soma(0, 3)} fator={fator} />
              <Resumo titulo="2º tri" meses="abr–jun" meta={soma(3, 6)} fator={fator} />
              <Resumo titulo="3º tri" meses="jul–set" meta={soma(6, 9)} fator={fator} />
              <Resumo titulo="4º tri" meses="out–dez" meta={soma(9, 12)} fator={fator} />
            </div>
          </section>
          <section aria-label="Metas por semestre">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Por semestre</h3>
            <div className="grid grid-cols-2 gap-2">
              <Resumo titulo="1º sem" meses="jan–jun" meta={soma(0, 6)} fator={fator} />
              <Resumo titulo="2º sem" meses="jul–dez" meta={soma(6, 12)} fator={fator} />
            </div>
          </section>
          <section aria-label="Meta do ano">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Ano</h3>
            <div className="min-w-0 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2.5">
              <p className="text-[11px] font-medium text-blue-300">{ano} <span className="font-normal text-blue-300/60">· jan–dez</span></p>
              <p className="text-sm font-bold text-zinc-100 tabular-nums mt-0.5 truncate">{totalAno ? fmtMoeda(totalAno) : '–'}</p>
              <p className="text-[11px] text-zinc-400 tabular-nums truncate">Super {totalAno ? fmtMoeda(totalAno * fator) : '–'}</p>
            </div>
          </section>
        </div>

        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-zinc-500">
          <span>Faixas pelo realizado ÷ meta:</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5" />{ROTULO_FAIXA.sub} abaixo de 1</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5" />{ROTULO_FAIXA.meta} de 1 a {fmtFator(fator)}</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />{ROTULO_FAIXA.super} a partir de {fmtFator(fator)}</span>
          <span className="sm:ml-auto">
            {visao === 'meta'
              ? 'Valores em R$. Enter desce, Esc cancela. Dá para colar um bloco copiado do Excel (só os números).'
              : `Super Meta é calculada: Meta × ${fmtFator(fator)}. Para mudar, edite a Meta.`}
          </span>
        </div>

        {/* Tabela: meses nas linhas, empreendimentos nas colunas, como na planilha */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 overflow-x-auto custom-scrollbar">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${th} text-left sticky left-0 z-10 bg-[#0e0e11] pl-3`}>Mês</th>
                {emps.map((e, i) => {
                  const id = idsCv.get(e.nome) ?? null;
                  return (
                    <th key={e.nome} className={`${th} text-right relative`}>
                      <div className="flex items-center justify-end gap-1">
                        {id !== null && <Link2 size={11} className="text-zinc-600" aria-label="Vinculado ao CV CRM" />}
                        {!e.project_id && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500/70" title="Sem empreendimento do Orbit: não entra no Dashboard Analítico" />
                        )}
                        <span className="text-zinc-200">{e.nome}</span>
                        <button type="button" aria-label={`Configurar ${e.nome}`} aria-expanded={menuAberto === e.nome}
                          onClick={() => setMenuAberto(m => (m === e.nome ? null : e.nome))}
                          className="p-0.5 rounded text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800">
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                      {menuAberto === e.nome && (
                        <div className={`absolute top-full ${i >= emps.length - 2 ? 'right-0' : 'left-0'} z-40`}>
                          <MenuEmpreendimento
                            emp={e}
                            nomesExistentes={emps.map(x => x.nome)}
                            cv={cv}
                            projetos={projetos}
                            idVinculado={id}
                            podeEsquerda={i > 0}
                            podeDireita={i < emps.length - 1}
                            onMover={dir => mover.mutate({ i, dir })}
                            onFechar={() => setMenuAberto(null)}
                          />
                        </div>
                      )}
                    </th>
                  );
                })}
                <th className={`${th} px-2`}>
                  {novoNome === null ? (
                    <button type="button" onClick={() => setNovoNome('')}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300">
                      <Plus size={13} /> Empreendimento
                    </button>
                  ) : (
                    <input
                      autoFocus
                      aria-label="Nome do novo empreendimento"
                      placeholder="Nome e Enter"
                      value={novoNome}
                      onChange={e => { setNovoNome(e.target.value); setErro(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') adicionar(); if (e.key === 'Escape') setNovoNome(null); }}
                      onBlur={() => { if (!(novoNome ?? '').trim()) setNovoNome(null); }}
                      disabled={criar.isPending}
                      className="w-32 h-7 px-2 text-xs font-normal text-zinc-100 bg-zinc-900 border border-zinc-700 rounded-md outline-none focus:border-blue-500/70"
                    />
                  )}
                </th>
                <th className={`${th} text-right pr-3 bg-zinc-900/60`}>{visao === 'meta' ? 'Meta (R$)' : 'Super Meta (R$)'}</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((mes, l) => (
                <tr key={mes} className={`group ${l % 3 === 2 && l < 11 ? '[&>td]:border-b [&>td]:border-zinc-800' : ''}`}>
                  <td className="sticky left-0 z-10 bg-[#0e0e11] pl-3 pr-2 py-0.5 text-xs font-semibold text-zinc-400 whitespace-nowrap">
                    {MESES[l]}/{String(ano).slice(2)}
                  </td>
                  {emps.map((e, c) => {
                    const v = valor(e.nome, mes);
                    return (
                      <td key={e.nome} className="px-1 py-0.5">
                        {visao === 'meta' ? (
                          <CelulaMeta
                            valor={v}
                            alterado={rascunho.has(chave(e.nome, mes))}
                            linha={l}
                            coluna={c}
                            rotulo={`Meta de ${e.nome} em ${MESES[l]}/${ano}`}
                            onAlterar={nv => alterar(e.nome, mes, nv)}
                            onColar={t => colar(l, c, t)}
                          />
                        ) : (
                          <span className={`block h-8 leading-8 px-2 text-right text-xs tabular-nums ${v ? 'text-zinc-300' : 'text-zinc-700'}`}>
                            {v ? fmtNum(v * fator) : '–'}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td />
                  <td className={`${colTotal} pr-3 bg-zinc-900/60 ${totalMes[l] ? 'text-zinc-100' : 'text-zinc-700'}`}>
                    {totalMes[l] ? fmtNum(totalMes[l] * multiplicador) : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky left-0 z-10 bg-[#0e0e11] pl-3 pr-2 py-2.5 text-xs font-bold text-zinc-200 border-t border-zinc-800">Total</td>
                {emps.map((e, c) => (
                  <td key={e.nome} className={`${colTotal} px-3 py-2.5 border-t border-zinc-800 ${totalEmp[c] ? 'text-zinc-200' : 'text-zinc-700'}`}>
                    {totalEmp[c] ? fmtNum(totalEmp[c] * multiplicador) : '–'}
                  </td>
                ))}
                <td className="border-t border-zinc-800" />
                <td className={`${colTotal} pr-3 py-2.5 border-t border-zinc-800 bg-zinc-900/60 text-blue-300`}>
                  {totalAno ? fmtNum(totalAno * multiplicador) : '–'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {emps.length === 0 && (
          <p className="text-xs text-zinc-500">Nenhum empreendimento ainda. Use “+ Empreendimento” no cabeçalho da tabela.</p>
        )}
      </div>
    </div>
  );
}

export default function MetasComercial() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['comercialMetas'],
    queryFn: fetchMetasComercial,
    staleTime: 60 * 1000,
  });
  // Empreendimentos do CV só para o vínculo; se o CV não estiver ativo, a aba funciona igual.
  const { data: cvDados } = useQuery({ queryKey: ['cvComercial'], queryFn: fetchCvComercial, staleTime: 5 * 60 * 1000, retry: 1 });
  // Empreendimentos do Orbit: vínculo com o Dashboard Analítico (mesma chave do App, vem do cache).
  const { data: projetos } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });
  const projetosOrbit = useMemo(
    () => (projetos ?? []).map(p => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [projetos],
  );
  const cv = useMemo<EmpreendimentoCv[]>(() => {
    const m = new Map<number, string>();
    (cvDados?.unidades ?? []).forEach(u => m.set(Number(u.idempreendimento), u.empreendimento));
    return [...m.entries()].map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => nomeCurtoEmpreendimento(a.nome).nome.localeCompare(nomeCurtoEmpreendimento(b.nome).nome, 'pt-BR'));
  }, [cvDados]);

  if (isLoading) {
    return <div className="h-full flex items-center justify-center gap-2 text-xs text-zinc-500"><RefreshCw size={16} className="animate-spin" /> Carregando metas</div>;
  }
  if (isError || !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
        <AlertTriangle size={20} className="text-zinc-500" />
        <p className="text-sm font-semibold text-zinc-200">Não foi possível carregar as metas</p>
        <p className="text-xs text-zinc-500 max-w-sm">A conexão falhou ou a tabela de metas ainda não foi criada neste ambiente.</p>
        <button type="button" onClick={() => refetch()} disabled={isFetching}
          className="mt-1 px-3 py-1.5 text-xs font-semibold text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg disabled:opacity-50">
          Tentar de novo
        </button>
      </div>
    );
  }
  return <PainelMetas metas={data} cv={cv} projetos={projetosOrbit} />;
}
