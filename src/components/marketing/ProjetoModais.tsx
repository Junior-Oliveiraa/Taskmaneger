import React, { useState } from 'react';
import { X, Loader2, Trash2 } from 'lucide-react';
import {
  MarketingProjeto, MarketingPortfolio, ProjetoStatus, STATUS_PROJETO, CORES_PROJETO,
  salvarProjeto, excluirProjeto, salvarPortfolio, excluirPortfolio,
} from '../../lib/marketingProjetos';

function Moldura({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-md bg-[#0f0f12] border border-zinc-800 rounded-xl shadow-2xl"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80">
          <h2 className="text-sm font-semibold text-zinc-100">{titulo}</h2>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-200 rounded hover:bg-zinc-800/60"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

const campo = 'w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600';
const rotulo = 'block text-[11px] font-medium text-zinc-500 mb-1.5';

function SeletorCor({ cor, onChange }: { cor: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CORES_PROJETO.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-full border-2 transition-transform ${cor === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
          style={{ backgroundColor: c }}
          aria-label={`Cor ${c}`}
        />
      ))}
    </div>
  );
}

function Rodape({ salvando, erro, podeExcluir, onExcluir, onCancelar, rotuloSalvar }: {
  salvando: boolean; erro: string | null; podeExcluir: boolean; onExcluir: () => void; onCancelar: () => void; rotuloSalvar: string;
}) {
  return (
    <>
      {erro && <p className="text-[12px] text-red-400">{erro}</p>}
      <div className="flex items-center justify-between pt-1">
        {podeExcluir ? (
          <button type="button" onClick={onExcluir} disabled={salvando} className="flex items-center gap-1.5 text-[12px] text-red-400 hover:text-red-300 disabled:opacity-50">
            <Trash2 size={13} /> Excluir
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancelar} className="px-3 py-1.5 text-[12px] text-zinc-400 hover:text-zinc-200">Cancelar</button>
          <button type="submit" disabled={salvando} className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-md disabled:opacity-60">
            {salvando && <Loader2 size={12} className="animate-spin" />} {rotuloSalvar}
          </button>
        </div>
      </div>
    </>
  );
}

export function ProjetoModal({ projeto, portfolios, portfolioInicial, onClose, onSalvo }: {
  projeto?: MarketingProjeto | null;
  portfolios: MarketingPortfolio[];
  portfolioInicial?: string | null;
  onClose: () => void;
  onSalvo: (id: string | null) => void;
}) {
  const [nome, setNome] = useState(projeto?.nome ?? '');
  const [descricao, setDescricao] = useState(projeto?.descricao ?? '');
  const [cor, setCor] = useState(projeto?.cor ?? CORES_PROJETO[0]);
  const [status, setStatus] = useState<ProjetoStatus>(projeto?.status ?? 'ativo');
  const [portfolioId, setPortfolioId] = useState<string | null>(projeto?.portfolioId ?? portfolioInicial ?? null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) { setErro('Dê um nome ao projeto.'); return; }
    setSalvando(true); setErro(null);
    try {
      const id = await salvarProjeto({ id: projeto?.id, nome, descricao, cor, status, portfolioId });
      onSalvo(id);
    } catch (err: any) {
      setErro(err.message); setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!projeto || !confirm(`Excluir o projeto "${projeto.nome}"? As tarefas continuam existindo, só saem do projeto.`)) return;
    setSalvando(true);
    try { await excluirProjeto(projeto.id); onSalvo(null); }
    catch (err: any) { setErro(err.message); setSalvando(false); }
  };

  return (
    <Moldura titulo={projeto ? 'Editar projeto' : 'Novo projeto'} onClose={onClose}>
      <form onSubmit={salvar} className="space-y-4">
        <div>
          <label className={rotulo}>Nome</label>
          <input autoFocus value={nome} onChange={e => setNome(e.target.value)} className={campo} placeholder="Ex.: Lançamento Residencial Aurora" />
        </div>
        <div>
          <label className={rotulo}>Descrição</label>
          <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} className={`${campo} resize-none`} placeholder="Objetivo, escopo, prazos..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={rotulo}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as ProjetoStatus)} className={campo}>
              {STATUS_PROJETO.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className={rotulo}>Portfólio</label>
            <select value={portfolioId ?? ''} onChange={e => setPortfolioId(e.target.value || null)} className={campo}>
              <option value="">Nenhum</option>
              {portfolios.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={rotulo}>Cor</label>
          <SeletorCor cor={cor} onChange={setCor} />
        </div>
        <Rodape salvando={salvando} erro={erro} podeExcluir={!!projeto} onExcluir={excluir} onCancelar={onClose} rotuloSalvar={projeto ? 'Salvar' : 'Criar projeto'} />
      </form>
    </Moldura>
  );
}

export function PortfolioModal({ portfolio, onClose, onSalvo }: {
  portfolio?: MarketingPortfolio | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState(portfolio?.nome ?? '');
  const [descricao, setDescricao] = useState(portfolio?.descricao ?? '');
  const [cor, setCor] = useState(portfolio?.cor ?? CORES_PROJETO[1]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) { setErro('Dê um nome ao portfólio.'); return; }
    setSalvando(true); setErro(null);
    try { await salvarPortfolio({ id: portfolio?.id, nome, descricao, cor }); onSalvo(); }
    catch (err: any) { setErro(err.message); setSalvando(false); }
  };

  const excluir = async () => {
    if (!portfolio || !confirm(`Excluir o portfólio "${portfolio.nome}"? Os projetos dele continuam existindo, sem portfólio.`)) return;
    setSalvando(true);
    try { await excluirPortfolio(portfolio.id); onSalvo(); }
    catch (err: any) { setErro(err.message); setSalvando(false); }
  };

  return (
    <Moldura titulo={portfolio ? 'Editar portfólio' : 'Novo portfólio'} onClose={onClose}>
      <form onSubmit={salvar} className="space-y-4">
        <div>
          <label className={rotulo}>Nome</label>
          <input autoFocus value={nome} onChange={e => setNome(e.target.value)} className={campo} placeholder="Ex.: Lançamentos 2027" />
        </div>
        <div>
          <label className={rotulo}>Descrição</label>
          <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} className={`${campo} resize-none`} />
        </div>
        <div>
          <label className={rotulo}>Cor</label>
          <SeletorCor cor={cor} onChange={setCor} />
        </div>
        <Rodape salvando={salvando} erro={erro} podeExcluir={!!portfolio} onExcluir={excluir} onCancelar={onClose} rotuloSalvar={portfolio ? 'Salvar' : 'Criar portfólio'} />
      </form>
    </Moldura>
  );
}
