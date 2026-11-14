import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, MessageSquare, SendHorizontal, Trash2, UserRound } from 'lucide-react';
import type { UserProfile } from '../../context/AuthContext';
import { PropostaMensagem, apagarPropostaMensagem, enviarPropostaMensagem } from '../../lib/comercialApi';

// ── Avatar ──────────────────────────────────────────────────────────────────

const CORES_AVATAR = ['bg-blue-500/25 text-blue-200', 'bg-indigo-500/25 text-indigo-200', 'bg-sky-500/20 text-sky-200', 'bg-teal-500/20 text-teal-200', 'bg-slate-500/25 text-slate-200'];
const corDe = (id: string) => CORES_AVATAR[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % CORES_AVATAR.length];
const iniciais = (nome: string) => nome.trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() || '?';

export function AvatarUsuario({ id, nome, url, tamanho = 24 }: { id: string; nome: string; url?: string | null; tamanho?: number }) {
  const estilo = { width: tamanho, height: tamanho, fontSize: Math.max(9, Math.round(tamanho * 0.4)) };
  if (url) return <img src={url} alt={nome} title={nome} style={estilo} className="rounded-full object-cover shrink-0" />;
  return (
    <span title={nome} style={estilo} className={`rounded-full shrink-0 grid place-items-center font-semibold ${corDe(id)}`}>
      {iniciais(nome)}
    </span>
  );
}

// ── Seletor de responsável ──────────────────────────────────────────────────

export function SeletorResponsavel({ usuarios, valor, onChange, desabilitado }: {
  usuarios: UserProfile[];
  valor: string | null;
  onChange: (id: string | null) => void;
  desabilitado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const atual = usuarios.find(u => u.id === valor) ?? null;
  const lista = useMemo(() => {
    const q = busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return [...usuarios]
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .filter(u => !q || u.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q));
  }, [usuarios, busca]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button" disabled={desabilitado}
        onClick={() => { setAberto(a => !a); setBusca(''); }}
        className="inline-flex items-center gap-2 h-8 min-w-[180px] pl-1.5 pr-2 rounded-md border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/70 hover:border-zinc-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        title={desabilitado ? 'Sem permissão para trocar o responsável' : 'Trocar responsável'}
      >
        {atual
          ? <AvatarUsuario id={atual.id} nome={atual.name} url={atual.avatarUrl} tamanho={22} />
          : <span className="w-[22px] h-[22px] rounded-full border border-dashed border-zinc-600 grid place-items-center text-zinc-500"><UserRound size={11} /></span>}
        <span className={`flex-1 text-left text-[13px] font-medium max-w-[180px] truncate ${atual ? 'text-zinc-100' : 'text-zinc-500'}`}>{atual?.name ?? 'Definir responsável'}</span>
        {!desabilitado && <ChevronDown size={13} className="text-zinc-500" />}
      </button>

      {aberto && (
        <div className="absolute left-0 top-full mt-2 z-50 w-64 py-1 bg-[#141417] border border-zinc-800 rounded-xl shadow-xl shadow-black/60">
          <div className="px-2 pb-1">
            <input
              autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar usuário…"
              className="w-full h-8 px-2.5 text-[12px] rounded-md bg-zinc-950/70 border border-zinc-800 text-zinc-100 outline-none focus:border-blue-500/60"
            />
          </div>
          <div className="max-h-64 overflow-y-auto scrollbar-minimal">
            {lista.map(u => (
              <button
                key={u.id} type="button"
                onClick={() => { onChange(u.id); setAberto(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition-colors ${u.id === valor ? 'bg-zinc-800/60 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/40 hover:text-zinc-100'}`}
              >
                <AvatarUsuario id={u.id} nome={u.name} url={u.avatarUrl} tamanho={22} />
                <span className="truncate">{u.name}</span>
              </button>
            ))}
            {lista.length === 0 && <p className="px-3 py-2 text-[12px] text-zinc-500">Nenhum usuário encontrado.</p>}
          </div>
          {valor && (
            <button
              type="button" onClick={() => { onChange(null); setAberto(false); }}
              className="w-full mt-1 px-3 py-1.5 text-left text-[12px] text-zinc-500 hover:text-rose-300 border-t border-zinc-800/80"
            >
              Remover responsável
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Conversa ────────────────────────────────────────────────────────────────

const horaBr = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diaChave = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
function rotuloDia(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: d.getFullYear() === hoje.getFullYear() ? undefined : 'numeric' });
}

export default function PropostaChat({ propostaId, mensagens, usuarios, meuId, className = '' }: {
  propostaId: string;
  /** Só as desta proposta, em ordem de criação. */
  mensagens: PropostaMensagem[];
  usuarios: UserProfile[];
  meuId: string | null;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const porId = useMemo(() => new Map(usuarios.map(u => [u.id, u])), [usuarios]);
  const totalMensagens = mensagens.filter(m => m.tipo === 'mensagem').length;

  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [mensagens.length, propostaId]);

  // Campo cresce até 5 linhas.
  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [texto]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await enviarPropostaMensagem(propostaId, t);
      setTexto('');
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setEnviando(false);
      queryClient.invalidateQueries({ queryKey: ['comercialPropostaMensagens'] });
    }
  };

  const apagar = async (m: PropostaMensagem) => {
    if (!window.confirm('Apagar esta mensagem?')) return;
    try {
      await apagarPropostaMensagem(m.id);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível apagar a mensagem.');
    } finally {
      queryClient.invalidateQueries({ queryKey: ['comercialPropostaMensagens'] });
    }
  };

  return (
    <section className={`flex flex-col min-h-0 bg-[#09090b] ${className}`}>
      <header className="flex items-center gap-2 px-4 h-12 border-b border-zinc-800/60 shrink-0">
        <MessageSquare size={14} className="text-blue-400" />
        <h3 className="text-[13px] font-semibold text-zinc-100">Conversa</h3>
        {totalMensagens > 0 && (
          <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-1.5 rounded border border-zinc-800">{totalMensagens}</span>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal px-4 py-3">
        {mensagens.length === 0 ? (
          <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center gap-2 text-zinc-500">
            <MessageSquare size={22} className="text-zinc-700" />
            <p className="text-[12px] max-w-[220px]">Nenhuma mensagem ainda. Combine os próximos passos da proposta por aqui.</p>
          </div>
        ) : (
          <ol className="space-y-1">
            {mensagens.map((m, i) => {
              const ant = mensagens[i - 1];
              const novoDia = !ant || diaChave(ant.createdAt) !== diaChave(m.createdAt);
              const autor = m.autorId ? porId.get(m.autorId) : undefined;
              const nome = autor?.name ?? m.autorNome ?? 'Usuário removido';
              const separador = novoDia && (
                <li className="flex items-center gap-3 py-2" aria-hidden>
                  <span className="flex-1 h-px bg-zinc-800/80" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{rotuloDia(m.createdAt)}</span>
                  <span className="flex-1 h-px bg-zinc-800/80" />
                </li>
              );

              if (m.tipo === 'evento') {
                return (
                  <React.Fragment key={m.id}>
                    {separador}
                    <li className="flex justify-center py-1">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900/80 border border-zinc-800/80 px-2.5 py-1 text-[11px] text-zinc-400 max-w-full">
                        <span className="w-1 h-1 rounded-full bg-blue-400 shrink-0" />
                        <span className="truncate"><b className="font-medium text-zinc-200">{nome}</b> {m.texto}</span>
                        <span className="text-zinc-600 tabular-nums shrink-0">{horaBr(m.createdAt)}</span>
                      </span>
                    </li>
                  </React.Fragment>
                );
              }

              const minha = !!meuId && m.autorId === meuId;
              // Mensagens seguidas do mesmo autor em até 5 min ficam agrupadas.
              const agrupada = !novoDia && ant?.tipo === 'mensagem' && ant.autorId === m.autorId
                && new Date(m.createdAt).getTime() - new Date(ant.createdAt).getTime() < 5 * 60_000;

              return (
                <React.Fragment key={m.id}>
                  {separador}
                  <li className={`group flex gap-2 ${minha ? 'flex-row-reverse' : ''} ${agrupada ? 'mt-0.5' : 'mt-3'}`}>
                    {!minha && (
                      <span className="w-7 shrink-0">
                        {!agrupada && <AvatarUsuario id={m.autorId ?? m.id} nome={nome} url={autor?.avatarUrl} tamanho={28} />}
                      </span>
                    )}
                    <div className={`min-w-0 max-w-[82%] flex flex-col ${minha ? 'items-end' : 'items-start'}`}>
                      {!agrupada && (
                        <span className={`mb-1 text-[11px] ${minha ? 'text-zinc-500' : 'text-zinc-400'}`}>
                          {minha ? 'Você' : <b className="font-medium text-zinc-200">{nome}</b>}
                          <span className="text-zinc-600"> · {horaBr(m.createdAt)}</span>
                        </span>
                      )}
                      <div className="flex items-center gap-1.5">
                        {minha && (
                          <button
                            type="button" onClick={() => apagar(m)} title="Apagar mensagem"
                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-600 hover:text-rose-300 transition-opacity"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                        <p
                          title={agrupada ? horaBr(m.createdAt) : undefined}
                          className={`px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words rounded-2xl ${
                            minha
                              ? 'bg-blue-600 text-white rounded-tr-md'
                              : 'bg-zinc-800/80 text-zinc-100 rounded-tl-md'
                          }`}
                        >
                          {m.texto}
                        </p>
                      </div>
                    </div>
                  </li>
                </React.Fragment>
              );
            })}
          </ol>
        )}
        <div ref={fim} />
      </div>

      <footer className="p-3 border-t border-zinc-800/60 shrink-0">
        {erro && <p className="mb-2 text-[11px] text-rose-300">{erro}</p>}
        <div className="flex items-end gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 focus-within:border-blue-500/50 transition-colors p-1.5 pl-3">
          <textarea
            ref={campo} rows={1} value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar(); }
            }}
            placeholder="Escreva uma mensagem…"
            className="flex-1 resize-none bg-transparent outline-none text-[13px] text-zinc-100 placeholder:text-zinc-600 py-1.5 max-h-[120px] scrollbar-minimal"
          />
          <button
            type="button" onClick={enviar} disabled={!texto.trim() || enviando}
            className="h-8 w-8 shrink-0 grid place-items-center rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors"
            title="Enviar (Enter)"
          >
            <SendHorizontal size={15} />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-zinc-600">Enter envia · Shift+Enter quebra a linha</p>
      </footer>
    </section>
  );
}
