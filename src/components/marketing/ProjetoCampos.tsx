// Campos editáveis do projeto (status, prioridade, empreendimentos e
// datas). O mesmo menu serve ao formulário e às células da lista de Projetos;
// muda só o gatilho.
import React, { useState } from 'react';
import {
  ArrowRight, Calendar, Check, Search,
} from 'lucide-react';
import type { TaskPriority } from '../../types';
import { STATUS_PROJETO, formatarData, type ProjetoStatus } from '../../lib/marketingProjetos';
import { ORDEM_PRIORIDADE, PRIORIDADE_INFO, PRIORIDADE_PILULA } from '../TarefaBadges';
import { FOCO, ItemMenu, Menu } from '../tarefa/Propriedade';
import DatePicker from '../DatePicker';

type Gatilho = { classe: string; gatilho: React.ReactNode; rotulo: string; alinhar?: 'left' | 'right'; disabled?: boolean; bloco?: boolean };

/** Cor (classe text-*) do status, para a bolinha. */
export const corStatus = (s: ProjetoStatus) =>
  (STATUS_PROJETO.find(x => x.id === s) ?? STATUS_PROJETO[0]).classe.match(/text-[a-z]+-\d+/)?.[0] ?? 'text-zinc-400';

/** "Jardim Ipê", "Jardim Ipê +2" ou vazio. */
export const textoEmpreendimentos = (nomes: string[]) =>
  nomes.length === 0 ? '' : nomes.length === 1 ? nomes[0] : `${nomes[0]} +${nomes.length - 1}`;

export function MenuStatus({ valor, onChange, ...g }: Gatilho & { valor: ProjetoStatus; onChange: (s: ProjetoStatus) => void }) {
  return (
    <Menu rotulo={g.rotulo} classe={g.classe} gatilho={g.gatilho} alinhar={g.alinhar} disabled={g.disabled} bloco={g.bloco} largura="w-44">
      {fechar => STATUS_PROJETO.map(s => (
        <ItemMenu key={s.id} marcado={s.id === valor} onClick={() => { fechar(); if (s.id !== valor) onChange(s.id); }}>
          <span className={`size-2 rounded-full shrink-0 bg-current ${corStatus(s.id)}`} aria-hidden />
          <span>{s.label}</span>
        </ItemMenu>
      ))}
    </Menu>
  );
}

export function MenuPrioridade({ valor, onChange, ...g }: Gatilho & { valor: TaskPriority; onChange: (p: TaskPriority) => void }) {
  return (
    <Menu rotulo={g.rotulo} classe={g.classe} gatilho={g.gatilho} alinhar={g.alinhar} disabled={g.disabled} bloco={g.bloco} largura="w-48">
      {fechar => ORDEM_PRIORIDADE.map(p => {
        const Icone = PRIORIDADE_PILULA[p].icone;
        return (
          <ItemMenu key={p} marcado={p === valor} onClick={() => { fechar(); if (p !== valor) onChange(p); }}>
            <Icone size={15} className={`shrink-0 ${PRIORIDADE_PILULA[p].cor}`} aria-hidden />
            <span>{PRIORIDADE_INFO[p].label}</span>
          </ItemMenu>
        );
      })}
    </Menu>
  );
}

/** Vários empreendimentos. */
export function MenuEmpreendimentos(props: Gatilho & {
  valor: string[]; opcoes: { id: string; name: string }[]; onChange: (ids: string[]) => void;
}) {
  return <MenuMulti {...props} item="empreendimento" vazio="Nenhum empreendimento cadastrado" />;
}

/** Escolha múltipla: o menu fica aberto enquanto se marca; com muitas opções, tem busca. */
export function MenuMulti({ valor, opcoes, onChange, item, vazio, icone, ...g }: Gatilho & {
  valor: string[]; opcoes: { id: string; name: string }[]; onChange: (ids: string[]) => void;
  /** Nome de um item, para a busca ("Buscar empreendimento…"). */
  item: string; vazio: string;
  /** Algo antes do nome (ex.: avatar). */
  icone?: (id: string) => React.ReactNode;
}) {
  const [termo, setTermo] = useState('');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(termo.trim());
  const visiveis = q ? opcoes.filter(o => norm(o.name).includes(q)) : opcoes;
  const alternar = (id: string) => onChange(valor.includes(id) ? valor.filter(x => x !== id) : [...valor, id]);
  return (
    <Menu rotulo={g.rotulo} classe={g.classe} gatilho={g.gatilho} alinhar={g.alinhar} disabled={g.disabled} bloco={g.bloco} largura="w-72" role="dialog">
      {() => <>
        {opcoes.length > 8 && (
          <div className="relative p-1 pb-1.5">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" aria-hidden />
            <input
              autoFocus
              value={termo}
              onChange={e => setTermo(e.target.value)}
              placeholder={`Buscar ${item}…`}
              aria-label={`Buscar ${item}`}
              className="w-full h-8 pl-8 pr-2 rounded-lg bg-[#0f0f12] border border-white/10 text-body text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-blue-500/60"
            />
          </div>
        )}
        <ul aria-label={g.rotulo} className="flex flex-col">
          {visiveis.map(o => {
            const marcado = valor.includes(o.id);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={marcado}
                  onClick={() => alternar(o.id)}
                  className={`w-full flex items-center gap-2.5 min-h-8 [@media(pointer:coarse)]:min-h-10 px-2 py-1 rounded-lg text-body text-left text-zinc-200 hover:bg-[#1F1F22] transition-colors ${FOCO}`}
                >
                  <span className={`size-4 shrink-0 inline-flex items-center justify-center rounded border ${marcado ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-600'}`} aria-hidden>
                    {marcado && <Check size={12} />}
                  </span>
                  {icone?.(o.id)}
                  <span className="truncate">{o.name}</span>
                </button>
              </li>
            );
          })}
          {visiveis.length === 0 && <li className="px-2 py-2 text-body text-zinc-500">{q ? 'Nada encontrado' : vazio}</li>}
        </ul>
        {valor.length > 0 && (
          <button type="button" onClick={() => onChange([])} className={`mt-1 h-8 px-2 rounded-lg text-left text-body text-zinc-400 hover:text-zinc-100 hover:bg-[#1F1F22] border-t border-white/5 ${FOCO}`}>
            Limpar seleção
          </button>
        )}
      </>}
    </Menu>
  );
}

/** Início → entrega numa pílula só, como no painel da tarefa. */
export function CampoDatas({ inicio, entrega, maxInicio, maxEntrega, onInicio, onEntrega, classe, disabled }: {
  inicio: string; entrega: string;
  maxInicio?: string | null; maxEntrega?: string | null;
  onInicio: (d: string) => void; onEntrega: (d: string) => void;
  classe: string; disabled?: boolean;
}) {
  const botao = (vazio: boolean) =>
    `h-6 px-1.5 rounded-md tabular-nums enabled:hover:text-zinc-50 enabled:hover:bg-[#27272a] transition-colors ${vazio ? 'text-zinc-400' : ''} ${FOCO}`;
  return (
    <div className={`${classe} !gap-0 !px-1.5`}>
      <Calendar size={14} className="shrink-0 ml-1.5 mr-0.5" aria-hidden />
      <span className="inline-flex">
        <DatePicker
          value={inicio}
          disabled={disabled}
          onChange={d => onInicio(d.slice(0, 10))}
          maxDate={maxInicio}
          trigger={<button type="button" disabled={disabled} title="Data de início" className={botao(!inicio)}>{inicio ? formatarData(inicio) : 'Início'}</button>}
        />
      </span>
      <ArrowRight size={14} className="shrink-0 text-zinc-500" aria-label="até" />
      <span className="inline-flex">
        <DatePicker
          value={entrega}
          disabled={disabled}
          onChange={d => onEntrega(d.slice(0, 10))}
          maxDate={maxEntrega}
          align="right"
          trigger={<button type="button" disabled={disabled} title="Data de entrega" className={botao(!entrega)}>{entrega ? formatarData(entrega) : 'Entrega'}</button>}
        />
      </span>
    </div>
  );
}
