// Aprovação de um texto ou criativo: a faixa abaixo dele e o histórico dos envios.
import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, CircleX, Clock, Send, Undo2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { User } from '../../lib/users';
import { Delivery } from '../../types';
import { Rodada, quemEnviou, situacaoDe } from '../../lib/aprovacao';
import { Miniaturas } from './Imagens';
import { CAMPO, FOCO, ItemMenu, Menu } from './Propriedade';

/** Como cada tipo aparece nos textos da interface. */
type Tipo = 'texto' | 'criativo';
const PREFIXO: Record<Tipo, string> = { texto: 'copy', criativo: 'design' };

const dataHora = (iso: string) =>
  `${new Date(iso).toLocaleDateString('pt-BR')} às ${new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

/** Botões da aprovação: todos chapados, com fundo e contorno na cor do texto. */
const BOTAO = `inline-flex items-center justify-center gap-2 h-9 [@media(pointer:coarse)]:h-10 px-3 rounded-lg border border-current/35 bg-current/10 text-body font-medium whitespace-nowrap hover:enabled:bg-current/15 hover:enabled:border-current/55 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${FOCO}`;

const RESULTADO: Record<Rodada['resultado'], { rotulo: string; cls: string }> = {
  pendente: { rotulo: 'Aguardando', cls: 'bg-amber-500/10 text-amber-400' },
  aprovado: { rotulo: 'Aprovado', cls: 'bg-emerald-500/10 text-emerald-400' },
  reprovado: { rotulo: 'Reprovado', cls: 'bg-red-500/10 text-red-400' },
  cancelado: { rotulo: 'Cancelado', cls: 'bg-[#1f1f23] text-zinc-400' },
};

/** Ícone da situação, nas abas. */
export function IconeSituacao({ entrega }: { entrega?: Delivery }) {
  const s = situacaoDe(entrega);
  if (s === 'pendente') return <Clock size={14} className="shrink-0 text-amber-400" role="img" aria-label="Aguardando aprovação" />;
  if (s === 'aprovado') return <CheckCircle2 size={14} className="shrink-0 text-emerald-400" role="img" aria-label="Aprovado" />;
  if (s === 'reprovado') return <CircleX size={14} className="shrink-0 text-red-400" role="img" aria-label="Reprovado" />;
  return null;
}

/** Lista de pessoas e, depois da escolha, o balão de confirmação. Fechar o menu desfaz a escolha. */
function EscolherAprovador({ tipo, nome, cor, pessoas, euId, onConfirmar }: {
  tipo: Tipo;
  nome: string;
  cor: string;
  pessoas: User[];
  euId?: string;
  onConfirmar: (userId: string) => void;
}) {
  const [escolhida, setEscolhida] = useState<User | null>(null);
  const confirmar = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const voltou = useRef(false);

  useEffect(() => {
    if (escolhida) confirmar.current?.focus();
    // Voltar tira o botão da tela: o foco segue para a lista.
    else if (voltou.current) lista.current?.querySelector('button')?.focus();
  }, [escolhida]);

  if (escolhida) {
    return (
      <div role="group" aria-label="Confirmar envio" className="flex flex-col gap-3 p-2">
        <div className="flex items-start gap-2.5">
          <img src={escolhida.avatarUrl} alt="" className="size-8 rounded-full object-cover shrink-0" />
          <div className="min-w-0 flex flex-col gap-0.5">
            <p className="text-body text-zinc-100 [overflow-wrap:anywhere]">
              Deseja enviar “{nome}” para {escolhida.id === euId ? 'a sua própria aprovação' : <>aprovação de <span className="font-semibold">{escolhida.name}</span></>}?
            </p>
            <p className="text-caption text-zinc-500">O {tipo} fica bloqueado até a resposta.</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => { voltou.current = true; setEscolhida(null); }} className={`${BOTAO} text-zinc-400`}>Voltar</button>
          <button ref={confirmar} type="button" onClick={() => onConfirmar(escolhida.id)} className={`${BOTAO} ${cor}`}>
            <Send size={15} aria-hidden /> Confirmar envio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={lista} className="flex flex-col">
      <p className="px-2 pt-1 pb-1.5 text-caption text-zinc-500">Quem vai aprovar?</p>
      {pessoas.map(u => (
        <ItemMenu key={u.id} onClick={() => setEscolhida(u)}>
          <img src={u.avatarUrl} alt="" className="size-5 rounded-full object-cover shrink-0" />
          <span className="truncate">{u.name}{u.id === euId && <span className="text-zinc-500"> (você)</span>}</span>
        </ItemMenu>
      ))}
    </div>
  );
}

/** Enviar, acompanhar e decidir. */
export function FaixaAprovacao({ tipo, cor = 'text-blue-400', nome, entrega, rodada, vazio, disabled, salvando, solicitanteId, bloqueio, anexos, onReprovando, onEnviar, onDecidir, onCancelar }: {
  tipo: Tipo;
  /** Cor da classe (`text-…`) no botão de enviar. */
  cor?: string;
  nome: string;
  entrega?: Delivery;
  /** Última rodada da entrega. */
  rodada?: Rodada;
  /** Sem conteúdo: ainda não dá para enviar. */
  vazio?: boolean;
  /** Motivo pelo qual ainda não dá para enviar (ex.: antecessor em aberto). */
  bloqueio?: string;
  disabled?: boolean;
  salvando?: boolean;
  /** Usado quando o envio é antigo e não gravou quem enviou. */
  solicitanteId?: string;
  /** O que vai junto da justificativa (ex.: imagens rabiscadas). */
  anexos?: React.ReactNode;
  onReprovando?: (reprovando: boolean) => void;
  /** Ausente quando o texto não existe mais: só resta decidir. */
  onEnviar?: (aprovadorId: string) => void;
  onDecidir: (decisao: 'approved' | 'rejected', justificativa: string) => void;
  onCancelar: () => void;
}) {
  const { currentUser, allUsers } = useAuth();
  const [reprovando, setReprovandoLocal] = useState(false);
  const setReprovando = (v: boolean) => { setReprovandoLocal(v); onReprovando?.(v); };
  const [motivo, setMotivo] = useState('');
  const idFalta = useId();

  const situacao = situacaoDe(entrega);
  const aprovador = allUsers.find(u => u.id === entrega?.approverId);
  const decide = !disabled && situacao === 'pendente' && (!entrega?.approverId || entrega.approverId === currentUser?.id);
  const enviou = entrega ? quemEnviou(entrega) || solicitanteId : undefined;
  const cancela = !disabled && situacao === 'pendente' && (!enviou || enviou === currentUser?.id);

  // Quem aprovou por último vem primeiro; a própria pessoa, no fim.
  const pessoas = [...allUsers].sort((a, b) => {
    const peso = (id: string) => id === entrega?.approverId ? 0 : id === currentUser?.id ? 2 : 1;
    return peso(a.id) - peso(b.id) || a.name.localeCompare(b.name, 'pt-BR');
  });

  if (situacao === 'pendente' || situacao === 'aprovado') {
    const pendente = situacao === 'pendente';
    return (
      <div id={`target-${PREFIXO[tipo]}-delivery-${entrega!.id}`} className="flex flex-col gap-3 scroll-mt-20">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-h-9">
          <p className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-body">
            {pendente ? <Clock size={15} className="shrink-0 text-amber-400" aria-hidden /> : <CheckCircle2 size={15} className="shrink-0 text-emerald-400" aria-hidden />}
            <span className={`font-medium ${pendente ? 'text-amber-400' : 'text-emerald-400'}`}>
              {pendente
                ? decide ? 'Aguardando a sua aprovação' : `Aguardando aprovação${aprovador ? ` de ${aprovador.name}` : ''}`
                : `Aprovado${rodada?.resolvidoPor ? ` por ${rodada.resolvidoPor}` : ''}`}
            </span>
            {rodada && (
              <span className="text-zinc-500 tabular-nums">
                {pendente
                  ? `Enviado ${rodada.enviadoPor ? `por ${rodada.enviadoPor} ` : ''}em ${dataHora(rodada.enviadoEm)}`
                  : rodada.resolvidoEm && dataHora(rodada.resolvidoEm)}
              </span>
            )}
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {salvando && <span role="status" className="text-body text-zinc-500">Salvando…</span>}
            {cancela && !reprovando && (
              <button type="button" disabled={salvando} onClick={onCancelar} title={`O ${tipo} volta a ser editável`} className={`${BOTAO} text-zinc-400`}>
                <Undo2 size={15} aria-hidden /> Cancelar envio
              </button>
            )}
            {decide && !reprovando && <>
              <button type="button" disabled={salvando} onClick={() => setReprovando(true)} className={`${BOTAO} text-red-400`}>
                <X size={15} aria-hidden /> Reprovar
              </button>
              <button type="button" disabled={salvando} onClick={() => onDecidir('approved', '')} className={`${BOTAO} text-emerald-400`}>
                <Check size={15} aria-hidden /> Aprovar
              </button>
            </>}
          </div>
        </div>
        {decide && reprovando && (
          <form
            className="flex flex-col gap-2 animate-slide-down"
            onSubmit={e => { e.preventDefault(); if (motivo.trim()) onDecidir('rejected', motivo); }}
          >
            <textarea
              value={motivo}
              autoFocus
              required
              onChange={e => setMotivo(e.target.value)}
              onKeyDown={e => {
                // Com algo escrito, o Esc não pode descartar a justificativa nem fechar o painel.
                if (e.key !== 'Escape') return;
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                if (!motivo.trim()) setReprovando(false);
              }}
              placeholder="O que precisa ser ajustado?"
              aria-label={`Justificativa da reprovação de ${nome}`}
              className={`${CAMPO} py-2 min-h-24 resize-y`}
            />
            {anexos}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setReprovando(false)} className={`${BOTAO} text-zinc-400`}>Cancelar</button>
              <button type="submit" disabled={salvando || !motivo.trim()} className={`${BOTAO} text-red-400`}>
                Confirmar reprovação
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  if (disabled || !onEnviar) return null;
  const denovo = situacao === 'reprovado';
  const falta = bloqueio ?? (vazio ? (tipo === 'texto' ? 'Escreva o texto para enviar' : 'Adicione uma imagem para enviar') : undefined);
  return (
    <div id={entrega && `target-${PREFIXO[tipo]}-delivery-${entrega.id}`} className="flex flex-col gap-3 scroll-mt-20">
      {denovo && rodada?.resultado === 'reprovado' && (
        <div role="status" className="flex flex-col gap-1 p-3 rounded-xl bg-red-500/10">
          <p className="flex flex-wrap items-center gap-x-2 text-body">
            <CircleX size={15} className="shrink-0 text-red-400" aria-hidden />
            <span className="font-medium text-red-400">Reprovado{rodada.resolvidoPor ? ` por ${rodada.resolvidoPor}` : ''}</span>
            {rodada.resolvidoEm && <span className="text-zinc-500 tabular-nums">{dataHora(rodada.resolvidoEm)}</span>}
          </p>
          {rodada.justificativa && <p className="text-body text-zinc-200 whitespace-pre-wrap [overflow-wrap:anywhere]">{rodada.justificativa}</p>}
          {rodada.anotadas.length > 0 && <div className="pt-1"><Miniaturas imagens={rodada.anotadas} rotulo="Ajustes rabiscados" /></div>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Menu
          rotulo={`${denovo ? 'Enviar novamente' : 'Enviar para aprovação'}: ${nome}`}
          descritoPor={falta && idFalta}
          disabled={salvando || !!falta}
          largura="w-80"
          classe={`${BOTAO} ${cor}`}
          gatilho={<><Send size={15} aria-hidden /> {salvando ? 'Enviando…' : denovo ? 'Enviar novamente' : 'Enviar para aprovação'}</>}
        >
          {fechar => (
            <EscolherAprovador
              tipo={tipo}
              nome={nome}
              cor={cor}
              pessoas={pessoas}
              euId={currentUser?.id}
              onConfirmar={id => { fechar(); onEnviar(id); }}
            />
          )}
        </Menu>
        {falta && !salvando && <span id={idFalta} className="text-body text-zinc-500">{falta}</span>}
      </div>
    </div>
  );
}

const COLUNAS = '@3xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_7.5rem_6.5rem]';

/** Envios, decisões e justificativas, do mais recente ao mais antigo. */
export function HistoricoAprovacao({ tipo, rodadas }: { tipo: Tipo; rodadas: Rodada[] }) {
  const { allUsers } = useAuth();
  const [aberta, setAberta] = useState<string | null>(null);

  if (rodadas.length === 0) return <p className="text-body text-zinc-500">Os envios para aprovação aparecem aqui.</p>;

  return (
    <div className="@container">
      <div className={`hidden @3xl:grid ${COLUNAS} gap-x-4 pb-2 text-caption text-zinc-500`} aria-hidden>
        <span>{tipo === 'texto' ? 'Texto' : 'Criativo'}</span><span>Envio</span><span>Resolução</span><span>Situação</span>
      </div>
      <ul className="flex flex-col divide-y divide-white/10 border-y border-white/10">
        {rodadas.map(r => {
          const nomeAprovador = allUsers.find(u => u.id === r.aprovadorId)?.name;
          const expandida = aberta === r.id;
          return (
            <li key={r.id} className="flex flex-col gap-2 py-3">
              <div className={`grid grid-cols-1 ${COLUNAS} gap-x-4 gap-y-1.5 items-start`}>
                <p className="min-w-0 text-body">
                  <span className="font-medium text-zinc-200 [overflow-wrap:anywhere]">{r.nome}</span>
                  <span className="block text-caption text-zinc-500">{r.numero}º envio</span>
                </p>
                <p className="min-w-0 text-body text-zinc-300 tabular-nums">
                  <span className="@3xl:hidden text-zinc-500">Enviado em </span>{dataHora(r.enviadoEm)}
                  {r.enviadoPor && <span className="block text-caption text-zinc-500 truncate">por {r.enviadoPor}</span>}
                </p>
                <p className="min-w-0 text-body text-zinc-300 tabular-nums">
                  {r.resolvidoEm ? <>
                    <span className="@3xl:hidden text-zinc-500">{r.resultado === 'cancelado' ? 'Cancelado em ' : 'Resolvido em '}</span>{dataHora(r.resolvidoEm)}
                    {r.resolvidoPor && <span className="block text-caption text-zinc-500 truncate">por {r.resolvidoPor}</span>}
                  </> : r.resultado === 'pendente' ? <span className="text-zinc-500">{nomeAprovador ? `Com ${nomeAprovador}` : 'Sem resposta'}</span> : <span className="text-zinc-500">—</span>}
                </p>
                <span className={`justify-self-start inline-flex items-center h-7 px-2.5 rounded-lg text-caption font-medium whitespace-nowrap ${RESULTADO[r.resultado].cls}`}>{RESULTADO[r.resultado].rotulo}</span>
                {(tipo === 'texto' ? r.html : r.imagens.length > 0) && (
                  <button
                    type="button"
                    aria-expanded={expandida}
                    aria-label={`${expandida ? 'Ocultar' : 'Ver'} o ${tipo} do ${r.numero}º envio de ${r.nome}`}
                    onClick={() => setAberta(expandida ? null : r.id)}
                    className={`justify-self-start @3xl:justify-self-end inline-flex items-center gap-1 h-7 [@media(pointer:coarse)]:h-10 rounded text-caption font-medium text-zinc-400 hover:text-zinc-100 transition-colors ${FOCO}`}
                  >
                    Ver {tipo === 'texto' ? 'texto' : 'arte'} <ChevronDown size={14} className={`transition-transform ${expandida ? 'rotate-180' : ''}`} aria-hidden />
                  </button>
                )}
              </div>
              {r.justificativa && (
                <p className="pl-3 border-l-2 border-red-500/50 text-body text-zinc-300 whitespace-pre-wrap [overflow-wrap:anywhere]">{r.justificativa}</p>
              )}
              {r.anotadas.length > 0 && <div className="pl-3 border-l-2 border-red-500/50"><Miniaturas imagens={r.anotadas} rotulo="Ajustes rabiscados" /></div>}
              {r.comentarios.map(c => (
                <div key={c.id} className="pl-3 border-l-2 border-white/10 text-body text-zinc-300">
                  <p className="text-caption text-zinc-500 tabular-nums">{c.autor && `${c.autor} · `}{dataHora(c.em)}</p>
                  {c.citacao && <p className="text-zinc-500 whitespace-pre-wrap [overflow-wrap:anywhere]">“{c.citacao}”</p>}
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{c.texto}</p>
                </div>
              ))}
              {expandida && tipo === 'criativo' && <Miniaturas imagens={r.imagens} rotulo={`Arte do ${r.numero}º envio`} grande />}
              {expandida && tipo === 'texto' && (
                <div className="rte-content !min-h-0 !p-4 max-h-96 overflow-y-auto scrollbar-thin rounded-xl border border-zinc-800 select-text" dangerouslySetInnerHTML={{ __html: r.html }} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
