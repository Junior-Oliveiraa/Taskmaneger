// Linha da checklist. O quadradinho só marca/desmarca; cancelar fica no menu.
import React, { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { Ban, Check, GripVertical, Minus, MoreHorizontal, RotateCcw, Trash2, User as UserIcon } from 'lucide-react';
import type { Subtask } from '../../types';
import ReminderBell from '../ReminderBell';
import { BOTAO_ICONE, FOCO, ItemMenu, Menu } from './Propriedade';

const VISIVEL_HOVER = 'opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity';
const ACAO = `${BOTAO_ICONE} !size-7 [@media(pointer:coarse)]:!size-10`;

function CampoTitulo({ subtaskId, initialValue, onChange, onKeyDown, disabled, completed, canceled }: {
  subtaskId: string;
  initialValue: string;
  onChange: (val: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
  completed?: boolean;
  canceled?: boolean;
}) {
  const [val, setVal] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (disabled) setVal(initialValue);
  }, [initialValue, disabled]);

  useEffect(() => setVal(initialValue), [subtaskId]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [val]);

  return (
    <textarea
      ref={textareaRef}
      id={`subtask-input-${subtaskId}`}
      rows={1}
      value={val}
      disabled={disabled}
      aria-label="Item da checklist"
      onChange={(e) => {
        if (disabled) return;
        setVal(e.target.value);
        onChange(e.target.value);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (onKeyDown) onKeyDown(e);
      }}
      className={`flex-1 min-w-0 block py-0 bg-transparent border-0 outline-none focus:ring-0 text-body resize-none overflow-hidden placeholder-zinc-500 transition-colors ${
        canceled ? 'text-zinc-400 line-through decoration-zinc-500' : completed ? 'text-zinc-400' : 'text-zinc-200'
      } ${disabled ? 'cursor-not-allowed' : ''}`}
      placeholder="Descreva o item…"
    />
  );
}

export default function ItemChecklist({
  subtask, index, effectiveLock, sortedUsers, onToggle, onToggleCancel, onEditTitle, onKeyDown, onSetAssignee, onSetReminder, onDelete,
}: {
  subtask: Subtask;
  index: number;
  effectiveLock?: boolean;
  sortedUsers: { id: string; name: string; avatarUrl: string }[];
  onToggle: (id: string) => void;
  onToggleCancel: (id: string) => void;
  onEditTitle: (id: string, val: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, index: number, id: string) => void;
  onSetAssignee: (id: string, userId: string) => void;
  onSetReminder: (id: string, update: { reminderDate?: string; reminderType?: '3h' | '1d' | 'custom' | 'seen' }) => void;
  onDelete: (id: string) => void;
}) {
  const dragControls = useDragControls();
  const responsavel = sortedUsers.find(u => u.id === subtask.assigneeId);
  const encerrado = subtask.completed || subtask.canceled;
  const quando = encerrado && subtask.completedAt ? new Date(subtask.completedAt) : null;
  const estado = subtask.canceled ? 'Cancelado' : 'Concluído';
  const nome = subtask.title || 'item';

  return (
    <Reorder.Item
      id={`target-${subtask.id}`}
      value={subtask.id}
      dragListener={false}
      dragControls={dragControls}
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      style={{ marginLeft: `${(subtask.level || 0) * 1.5 - 0.5}rem` }}
      className="group/item relative flex items-start gap-2 min-h-9 [@media(pointer:coarse)]:min-h-12 py-1 px-2 -mr-2 rounded-lg hover:bg-[#161619] focus-within:bg-[#161619] transition-colors list-none"
    >
      {!effectiveLock && (
        <span
          onPointerDown={(e) => dragControls.start(e)}
          className={`absolute -left-3.5 top-[11px] text-zinc-500 hover:text-zinc-300 cursor-grab active:cursor-grabbing ${VISIVEL_HOVER}`}
          style={{ touchAction: 'none' }}
          title="Arrastar para reordenar"
        >
          <GripVertical size={14} aria-hidden />
        </span>
      )}
      <button
        type="button"
        role="checkbox"
        aria-checked={subtask.canceled ? 'mixed' : !!subtask.completed}
        aria-label={subtask.canceled ? `Reativar ${nome}` : `Concluir ${nome}`}
        title={encerrado ? `${estado}. Clique para reabrir` : 'Concluir'}
        onClick={() => onToggle(subtask.id)}
        disabled={!!effectiveLock}
        className={`shrink-0 size-7 -ml-1.5 inline-flex items-center justify-center rounded-md disabled:cursor-not-allowed ${FOCO}`}
      >
        <span className={`size-4 inline-flex items-center justify-center rounded-[5px] border transition-colors ${
          subtask.completed ? 'bg-blue-600 border-blue-600 text-white'
            : subtask.canceled ? 'bg-[#1F1F22] border-zinc-600 text-zinc-400'
            : 'border-zinc-500 hover:border-blue-400 hover:bg-blue-500/10'
        }`}>
          {subtask.completed ? <Check size={12} strokeWidth={3} aria-hidden /> : subtask.canceled ? <Minus size={12} strokeWidth={3} aria-hidden /> : null}
        </span>
      </button>

      <div className="flex-1 min-w-0 flex pt-1">
        <CampoTitulo
          subtaskId={subtask.id}
          initialValue={subtask.title}
          disabled={!!effectiveLock}
          completed={subtask.completed}
          canceled={subtask.canceled}
          onChange={(val) => onEditTitle(subtask.id, val)}
          onKeyDown={(e) => onKeyDown(e, index, subtask.id)}
        />
      </div>

      <div className="shrink-0 flex items-center gap-1 h-7">
        {subtask.canceled && <span className="shrink-0 text-caption text-zinc-500">Cancelado</span>}
        {quando && (
          <span className="text-caption text-zinc-500 tabular-nums whitespace-nowrap" title={`${estado} em ${quando.toLocaleString('pt-BR')}`}>
            {quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          </span>
        )}
        {!effectiveLock ? (
          <>
            <div className={responsavel ? '' : VISIVEL_HOVER}>
              <Menu
                rotulo={responsavel ? `Responsável: ${responsavel.name}` : 'Definir responsável'}
                titulo={responsavel ? `Responsável: ${responsavel.name}` : 'Definir responsável'}
                classe={ACAO}
                alinhar="right"
                largura="w-60"
                gatilho={responsavel
                  ? <img src={responsavel.avatarUrl} alt="" className="size-5 rounded-full object-cover" />
                  : <UserIcon size={15} aria-hidden />}
              >
                {fechar => <>
                  <ItemMenu marcado={!responsavel} onClick={() => { fechar(); onSetAssignee(subtask.id, ''); }}><span className="text-zinc-400">Sem responsável</span></ItemMenu>
                  {sortedUsers.map(u => (
                    <ItemMenu key={u.id} marcado={subtask.assigneeId === u.id} onClick={() => { fechar(); onSetAssignee(subtask.id, u.id); }}>
                      <img src={u.avatarUrl} alt="" className="size-5 rounded-full object-cover shrink-0" />
                      <span className="truncate">{u.name}</span>
                    </ItemMenu>
                  ))}
                </>}
              </Menu>
            </div>
            <div className={`px-1.5 flex items-center ${subtask.reminderType ? '' : VISIVEL_HOVER}`}>
              <ReminderBell
                reminderDate={subtask.reminderDate}
                reminderType={subtask.reminderType}
                onChange={(update) => onSetReminder(subtask.id, update)}
                size={14}
                showLabel={true}
                align="right"
                disableAutoScroll={true}
              />
            </div>
            <div className={VISIVEL_HOVER}>
              <Menu rotulo="Mais ações do item" titulo="Mais ações" classe={ACAO} alinhar="right" largura="w-48" gatilho={<MoreHorizontal size={15} aria-hidden />}>
                {fechar => <>
                  <ItemMenu onClick={() => { fechar(); onToggleCancel(subtask.id); }}>
                    {subtask.canceled ? <><RotateCcw size={14} className="text-zinc-400" aria-hidden /> Reativar item</> : <><Ban size={14} className="text-zinc-400" aria-hidden /> Cancelar item</>}
                  </ItemMenu>
                  <ItemMenu perigo onClick={() => { fechar(); onDelete(subtask.id); }}>
                    <Trash2 size={14} aria-hidden /> Excluir item
                  </ItemMenu>
                </>}
              </Menu>
            </div>
          </>
        ) : responsavel && <img src={responsavel.avatarUrl} alt="" title={responsavel.name} className="size-5 rounded-full object-cover" />}
      </div>
    </Reorder.Item>
  );
}
