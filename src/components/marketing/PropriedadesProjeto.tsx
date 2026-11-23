// Faixa de propriedades do projeto aberto, no mesmo formato das pílulas do painel
// da tarefa. Clicar numa pílula abre o formulário de edição do projeto.
import React from 'react';
import {
  ArrowRight, MapPin, Calendar, CircleDot,
} from 'lucide-react';
import {
  MarketingProjeto, STATUS_PROJETO, formatarData, useEmpreendimentos,
} from '../../lib/marketingProjetos';
import { PRIORIDADE_INFO, PRIORIDADE_PILULA } from '../TarefaBadges';
import { pilula } from '../tarefa/Propriedade';

export default function PropriedadesProjeto({ projeto, onEditar, membros }: {
  projeto: MarketingProjeto;
  /** Sem permissão de edição, as pílulas só mostram. */
  onEditar?: () => void;
  /** Avatares e painel de membros, no fim da faixa. */
  membros?: React.ReactNode;
}) {
  const empreendimentos = useEmpreendimentos();
  const status = STATUS_PROJETO.find(s => s.id === projeto.status) ?? STATUS_PROJETO[0];
  const corStatus = status.classe.split(' ')[0];
  const IconePrio = PRIORIDADE_PILULA[projeto.prioridade].icone;
  const entrega = projeto.dataEntrega;
  const nomesEmp = projeto.empreendimentoIds
    .map(id => empreendimentos.find(e => e.id === id)?.name)
    .filter(Boolean) as string[];

  // Pílula: botão que abre a edição; sem permissão, só leitura (sem hover).
  const Pilula = ({ rotulo, vazia, extra = '', children }: { rotulo: string; vazia?: boolean; extra?: string; children: React.ReactNode }) =>
    onEditar ? (
      <button type="button" onClick={onEditar} title={rotulo} className={`${pilula(vazia ? 'vazia' : 'cheia')} ${extra}`}>{children}</button>
    ) : (
      <span title={rotulo} className={`${pilula(vazia ? 'vazia' : 'cheia')} ${extra} pointer-events-none`}>{children}</span>
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pilula rotulo="Status">
        <CircleDot size={14} className={`shrink-0 ${corStatus}`} aria-hidden />
        <span className="truncate">{status.label}</span>
      </Pilula>

      <Pilula rotulo="Prioridade" vazia={projeto.prioridade === 'no_priority'} extra={PRIORIDADE_PILULA[projeto.prioridade].pilula}>
        <IconePrio size={15} className="shrink-0" aria-hidden />
        <span className="truncate">{projeto.prioridade === 'no_priority' ? 'Prioridade' : PRIORIDADE_INFO[projeto.prioridade].label}</span>
      </Pilula>

      <Pilula
        rotulo="Início e entrega"
        vazia={!projeto.dataInicio && !entrega}
      >
        <Calendar size={14} className="shrink-0" aria-hidden />
        {projeto.dataInicio || entrega ? <>
          <span className={`tabular-nums ${projeto.dataInicio ? '' : 'text-zinc-500'}`}>{projeto.dataInicio ? formatarData(projeto.dataInicio) : 'Início'}</span>
          <ArrowRight size={12} className="shrink-0 text-zinc-500" aria-hidden />
          <span className={`tabular-nums ${entrega ? '' : 'text-zinc-500'}`}>{entrega ? formatarData(entrega) : 'Entrega'}</span>
        </> : <span>Datas</span>}
      </Pilula>

      <Pilula rotulo={nomesEmp.length ? `Empreendimentos: ${nomesEmp.join(', ')}` : 'Empreendimentos'} vazia={!nomesEmp.length}>
        <MapPin size={14} className="shrink-0" aria-hidden />
        <span className="truncate max-w-[220px]">
          {nomesEmp.length === 0 ? 'Empreendimento' : nomesEmp.length === 1 ? nomesEmp[0] : `${nomesEmp[0]} +${nomesEmp.length - 1}`}
        </span>
      </Pilula>

      {membros}
    </div>
  );
}
