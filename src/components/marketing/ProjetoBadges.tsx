// Peças compartilhadas de projeto: status, progresso e entrega.
import React from 'react';
import { STATUS_PROJETO, ProjetoStatus } from '../../lib/marketingProjetos';
import { percentual } from '../../lib/projetosLista';
import { formatarDataCompleta, formatarDataCurta } from '../../lib/prazo';
import { hojeLocal } from '../../lib/datas';
import { LIMITE_ALERTA_ATRASO_DIAS } from '../MinhasTarefasQuadro';

export function ChipStatus({ status }: { status: ProjetoStatus }) {
  const s = STATUS_PROJETO.find(x => x.id === status) ?? STATUS_PROJETO[0];
  return <span className={`inline-flex items-center h-5 shrink-0 text-caption font-medium px-1.5 rounded border ${s.classe}`}>{s.label}</span>;
}

/** Barra em linha, com "3/10 · 30%" à direita (listas). */
export function ProgressoLinha({ concluidas, total, cor }: { concluidas: number; total: number; cor: string }) {
  const pct = percentual({ concluidas, total });
  return (
    <div className="flex items-center gap-2.5 min-w-0" title={`${concluidas} de ${total} tarefas concluídas`}>
      <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, backgroundColor: cor }} />
      </div>
      <span className="shrink-0 text-caption text-zinc-400 tabular-nums min-w-[72px] text-right">
        {concluidas}/{total} · {pct}%
      </span>
    </div>
  );
}

/** Entrega do projeto: neutra; vermelha só acima do limite de atraso. */
export function EntregaProjeto({ entrega, diasAtraso, concluido }: {
  entrega: string | null;
  diasAtraso: number;
  concluido: boolean;
}) {
  const hoje = hojeLocal();
  let texto = '—';
  let cor = 'text-zinc-500';
  if (entrega && diasAtraso > 0) {
    texto = `${formatarDataCurta(entrega)} · há ${diasAtraso} ${diasAtraso === 1 ? 'dia' : 'dias'}`;
    cor = diasAtraso > LIMITE_ALERTA_ATRASO_DIAS ? 'text-red-400 font-medium' : 'text-zinc-300';
  } else if (entrega) {
    texto = entrega === hoje ? 'Hoje' : formatarDataCurta(entrega);
    cor = concluido ? 'text-zinc-500' : entrega === hoje ? 'text-zinc-100 font-medium' : 'text-zinc-400';
  }
  return (
    <span
      className={`text-caption md:text-body text-right tabular-nums whitespace-nowrap ${cor}`}
      title={entrega ? `Entrega: ${formatarDataCompleta(entrega)}` : 'Sem data de entrega'}
    >
      {texto}
    </span>
  );
}
