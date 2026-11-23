// Status da tarefa como barra de progresso: uma etapa por status, clicar muda.
import React, { useEffect, useRef } from 'react';
import type { TaskStatus } from '../../types';
import { avancaStatus } from '../../lib/antecessores';
import { ORDEM_STATUS, STATUS_INFO, StatusIcone } from '../TarefaBadges';
import { FOCO } from './Propriedade';

export default function ProgressoStatus({ status, temPrazo, bloqueio, disabled, onMudar }: {
  status: TaskStatus;
  /** Sem prazo, o app só aceita "Sem previsão" e "Concluído". */
  temPrazo: boolean;
  /** Motivo pelo qual a tarefa ainda não pode seguir (ex.: antecessor em aberto). */
  bloqueio?: string;
  disabled?: boolean;
  onMudar: (novo: TaskStatus) => void;
}) {
  const trilho = useRef<HTMLDivElement>(null);
  const atual = ORDEM_STATUS.indexOf(status);
  const info = STATUS_INFO[status];

  // Em telas estreitas a barra rola: a etapa atual fica sempre à vista.
  useEffect(() => {
    const t = trilho.current;
    const etapa = t?.children[atual] as HTMLElement | undefined;
    if (t && etapa) t.scrollLeft = etapa.offsetLeft - (t.clientWidth - etapa.offsetWidth) / 2;
  }, [atual]);

  return (
    <div
      ref={trilho}
      role="group"
      aria-label={`Andamento da tarefa: ${info.label}`}
      className="relative flex gap-1.5 overflow-x-auto p-1 -m-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {ORDEM_STATUS.map((s, i) => {
        const ativo = i === atual;
        const semPrazo = !temPrazo && !ativo && s !== 'no_forecast' && s !== 'done';
        const espera = !!bloqueio && avancaStatus(status, s);
        const bloqueada = disabled || semPrazo || espera;
        const dica = espera ? bloqueio
          : bloqueada && !disabled ? 'Defina um prazo para usar este status'
          : ativo ? `Status atual: ${STATUS_INFO[s].label}`
          : `Mudar para ${STATUS_INFO[s].label}`;
        return (
          <button
            key={s}
            type="button"
            disabled={bloqueada}
            aria-current={ativo ? 'step' : undefined}
            title={dica}
            onClick={() => onMudar(s)}
            className={`group grow shrink-0 basis-auto min-w-[5.5rem] @min-[69rem]:basis-0 @min-[69rem]:min-w-[8.25rem] flex flex-col rounded-lg text-left disabled:cursor-not-allowed ${ativo ? 'cursor-default' : ''} ${FOCO}`}
          >
            <span
              aria-hidden
              className={`block w-full h-2 rounded-full transition duration-300 ${i <= atual ? info.dot : 'bg-[#30363d]/40'} ${i < atual ? 'opacity-55' : ''} ${bloqueada || ativo ? '' : 'group-hover:brightness-150'}`}
            />
            <span
              className={`flex items-center gap-1.5 w-full min-w-0 h-8 [@media(pointer:coarse)]:h-10 mt-0.5 text-body transition-colors ${
                ativo ? `font-medium ${info.cor}` : `${i < atual ? 'text-zinc-400' : 'text-zinc-500'} ${semPrazo || espera ? 'opacity-50' : bloqueada ? '' : 'group-hover:text-zinc-200'}`
              }`}
            >
              {ativo && <StatusIcone status={s} size={15} />}
              <span className="truncate">{STATUS_INFO[s].label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
