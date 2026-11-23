import React, { useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import DatePicker from './DatePicker';

export type ReminderType = '3h' | '1d' | 'custom' | 'seen';

interface ReminderBellProps {
  reminderDate?: string;
  reminderType?: ReminderType;
  onChange: (update: { reminderDate?: string; reminderType?: ReminderType }) => void;
  size?: number;
  showLabel?: boolean;
  align?: 'left' | 'right';
  disableAutoScroll?: boolean;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toISOLocal(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addHours(h: number): string {
  const t = new Date();
  t.setHours(t.getHours() + h);
  return toISOLocal(t);
}

function tomorrowAt8(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T08:00`;
}

export default function ReminderBell({
  reminderDate,
  reminderType,
  onChange,
  size = 13,
  showLabel = false,
  align = 'right',
  disableAutoScroll,
}: ReminderBellProps) {
  const [forceOpenKey, setForceOpenKey] = useState(0);
  const [awaitingCustomDate, setAwaitingCustomDate] = useState(false);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();

    if (reminderType === 'seen') {
      // Visto (verde) → remove o lembrete por completo
      onChange({ reminderDate: undefined, reminderType: undefined });
      setAwaitingCustomDate(false);
    } else if (!reminderType) {
      // Sem lembrete → +3h
      onChange({ reminderDate: addHours(3), reminderType: '3h' });
      setAwaitingCustomDate(false);
    } else if (reminderType === '3h') {
      // +3h → amanhã às 8h
      onChange({ reminderDate: tomorrowAt8(), reminderType: '1d' });
      setAwaitingCustomDate(false);
    } else if (awaitingCustomDate) {
      // 4º clique sem escolher data no calendário → remove o lembrete
      onChange({ reminderDate: undefined, reminderType: undefined });
      setAwaitingCustomDate(false);
    } else {
      // +1d ou custom → abre calendário personalizado
      setForceOpenKey(k => k + 1);
      setAwaitingCustomDate(true);
    }
  }

  const isSeen = reminderType === 'seen';

  const bellColor =
    isSeen
      ? 'text-emerald-400'
      : reminderType === '3h'
      ? 'text-blue-400'
      : reminderType === '1d'
      ? 'text-yellow-400'
      : reminderType === 'custom'
      ? 'text-orange-400'
      : 'text-zinc-400 hover:text-zinc-100';

  const formattedDateTime = reminderDate ? (() => {
    const [datePart, timePart] = reminderDate.split('T');
    if (!datePart || !timePart) return '';
    const [, m, d] = datePart.split('-');
    return `${d}/${m} ${timePart}`;
  })() : '';

  const labelText =
    isSeen
      ? (formattedDateTime ? `✓ ${formattedDateTime}` : '✓')
      : reminderType === '3h'
      ? '+3h'
      : reminderType === '1d'
      ? (formattedDateTime || '+1d')
      : reminderType === 'custom' && reminderDate
      ? formattedDateTime
      : null;

  const labelColor =
    isSeen
      ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
      : reminderType === '3h'
      ? 'text-blue-400 bg-blue-400/10 border-blue-400/20'
      : reminderType === '1d'
      ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
      : 'text-orange-400 bg-orange-400/10 border-orange-400/20';

  const title =
    isSeen
      ? `Concluído: ${formattedDateTime || 'Reconhecido'} (clique para remover)`
      : !reminderType
      ? 'Adicionar lembrete (+3h)'
      : awaitingCustomDate
      ? 'Escolha uma data ou clique novamente para remover'
      : reminderType === '3h'
      ? `Lembrete: +3h (clique para amanhã 8h)`
      : reminderType === '1d'
      ? `Lembrete: ${formattedDateTime || 'Amanhã 8h'} (clique para personalizar)`
      : `Lembrete: ${formattedDateTime || 'Personalizado'} (clique para editar)`;

  return (
    <div className="inline-flex items-center gap-1">
      <DatePicker
        value={reminderDate || ''}
        align={align}
        disableAutoScroll={disableAutoScroll}
        enableTime={true}
        forceOpen={forceOpenKey}
        disablePast={true}
        onChange={(date) => {
          setAwaitingCustomDate(false);
          if (date) {
            const selectedTime = new Date(date).getTime();
            if (selectedTime < Date.now() - 60000) return;
            onChange({ reminderDate: date, reminderType: 'custom' });
          } else {
            onChange({ reminderDate: undefined, reminderType: undefined });
          }
        }}
        trigger={
          <button
            type="button"
            className={`flex items-center justify-center p-1.5 -m-1.5 rounded-md transition-colors hover:bg-white/5 ${bellColor}`}
            title={title}
            onClick={handleClick}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {isSeen
              ? <BellOff size={size} className="fill-current" />
              : <Bell size={size} className={reminderType ? 'fill-current' : ''} />
            }
          </button>
        }
      />
    </div>
  );
}
