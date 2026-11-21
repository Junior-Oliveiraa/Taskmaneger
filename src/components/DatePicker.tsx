import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  trigger?: React.ReactNode;
  enableTime?: boolean;
  onQuickAdd?: () => void;
  fullWidth?: boolean;
  suggestedDate?: string;
  align?: 'left' | 'right';
  disableAutoScroll?: boolean;
  forceOpen?: number; // increment to programmatically open picker
  disabled?: boolean;
  disablePast?: boolean;
  /** Último dia selecionável (YYYY-MM-DD); dias depois ficam desabilitados. */
  maxDate?: string | null;
}

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function DatePicker({ value, onChange, trigger, enableTime, onQuickAdd, fullWidth, suggestedDate, align = 'left', disableAutoScroll, forceOpen, disabled, disablePast, maxDate }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const prevForceOpen = useRef(0);
  useEffect(() => {
    if (forceOpen && forceOpen !== prevForceOpen.current) {
      prevForceOpen.current = forceOpen;
      const d = value ? new Date(value.split('T')[0] + 'T00:00:00') : new Date();
      setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
      setIsOpen(true);
    }
  }, [forceOpen]);
  
  // Parse initial date or default to today
  const initialDate = value ? new Date(value.split('T')[0] + 'T00:00:00') : new Date();
  const [viewDate, setViewDate] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));

  let currentDatePart = '';
  let currentTimePart = '09:00';
  if (value) {
    if (value.includes('T')) {
       const parts = value.split('T');
       currentDatePart = parts[0];
       currentTimePart = parts[1];
    } else {
       currentDatePart = value;
    }
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [popoverPosition, setPopoverPosition] = useState<'top' | 'bottom'>('bottom');

  // Calculate popover position based on available space
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      if (spaceBelow < 360 && spaceAbove > spaceBelow) {
        setPopoverPosition('top');
      } else {
        setPopoverPosition('bottom');
      }
    }
  }, [isOpen]);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update view when opening
  const handleOpen = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (disabled) return;
    if (!value && onQuickAdd) {
      onQuickAdd();
      return;
    }
    const d = value 
      ? new Date(value.split('T')[0] + 'T00:00:00') 
      : (suggestedDate ? new Date(suggestedDate.split('T')[0] + 'T00:00:00') : new Date());
    setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
    setIsOpen(!isOpen);
  };

  const currentMonth = viewDate.getMonth();
  const currentYear = viewDate.getFullYear();

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();

  // Days from previous month to fill the first row
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
  
  const prevMonthDays = Array.from({ length: firstDayIndex }, (_, i) => {
    return { day: daysInPrevMonth - firstDayIndex + i + 1, isCurrentMonth: false, monthOffset: -1 };
  });

  const currentMonthDays = Array.from({ length: daysInMonth }, (_, i) => {
    return { day: i + 1, isCurrentMonth: true, monthOffset: 0 };
  });

  // Calculate remaining days to fill a 6-row grid (42 cells)
  const remainingCells = 42 - (prevMonthDays.length + currentMonthDays.length);
  const nextMonthDays = Array.from({ length: remainingCells }, (_, i) => {
    return { day: i + 1, isCurrentMonth: false, monthOffset: 1 };
  });

  const allDays = [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];

  const handlePrevMonth = (e: React.MouseEvent) => { e.stopPropagation(); setViewDate(new Date(currentYear, currentMonth - 1, 1)); };
  const handleNextMonth = (e: React.MouseEvent) => { e.stopPropagation(); setViewDate(new Date(currentYear, currentMonth + 1, 1)); };

  const handleSelectDay = (day: number, monthOffset: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const selectedDate = new Date(currentYear, currentMonth + monthOffset, day);
    const formatted = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    if (enableTime) {
      onChange(`${formatted}T${currentTimePart}`);
      setIsOpen(false);
    } else {
      onChange(formatted);
      setIsOpen(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
  };

  const handleToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const today = new Date();
    const formatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (enableTime) {
      onChange(`${formatted}T${currentTimePart}`);
      setIsOpen(false);
    } else {
      onChange(formatted);
      setIsOpen(false);
    }
  };

  // Format display value
  let displayValue = '';
  if (currentDatePart) {
    const [y, m, d] = currentDatePart.split('-');
    if (y && m && d) {
       displayValue = `${d}/${m}/${y}`;
    }
  }

  return (
    <div className={`relative ${trigger && !fullWidth ? 'inline-block' : 'w-full'}`} ref={containerRef}>
      {/* Trigger */}
      {trigger ? (
        <div
          onClick={disabled ? undefined : handleOpen}
          className={`${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'} ${fullWidth ? 'w-full' : 'inline-flex'}`}
        >
          {trigger}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={handleOpen}
          className="w-full flex items-center justify-between gap-1.5 text-[10px] font-sans font-medium px-2 py-1 rounded border text-zinc-300 bg-zinc-500/10 border-zinc-500/20 hover:bg-zinc-500/20 transition-colors cursor-pointer min-h-[26px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>{displayValue || 'Sem prazo'}</span>
          <span className="text-[9px] opacity-60 ml-1">▼</span>
        </button>
      )}

      {/* Popover */}
      {isOpen && (
        <div ref={popoverRef} className={`absolute ${popoverPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} ${align === 'right' ? 'right-0' : 'left-0'} w-[252px] bg-[#111113] border border-zinc-800/70 rounded-xl shadow-2xl shadow-black/70 overflow-hidden z-50 animate-fade-in`}>

          {/* Header — mês e navegação */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800/60">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[11px] font-semibold text-zinc-100 tracking-widest uppercase select-none">
              {MONTHS[currentMonth]} {currentYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </div>

          <div className="px-3 pt-3 pb-2">
            {/* Dias da semana */}
            <div className="grid grid-cols-7 mb-1.5">
              {WEEKDAYS.map((wd, i) => (
                <div key={i} className="h-6 flex items-center justify-center text-[9px] font-semibold text-zinc-600 uppercase tracking-wider select-none">
                  {wd}
                </div>
              ))}
            </div>

            {/* Grid de dias */}
            <div className="grid grid-cols-7">
              {allDays.map((slot, i) => {
                const targetDate = new Date(currentYear, currentMonth + slot.monthOffset, slot.day);
                const formattedDate = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
                const isSelected = formattedDate === currentDatePart;
                const isToday = new Date().toDateString() === targetDate.toDateString();
                const isSuggested = suggestedDate && formattedDate === suggestedDate.split('T')[0] && !isSelected;

                const isPast = (disablePast && targetDate.getTime() < new Date(new Date().setHours(0,0,0,0)).getTime())
                  || (!!maxDate && formattedDate > maxDate.slice(0, 10));

                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!slot.isCurrentMonth || isPast}
                    title={isSuggested ? 'Data sugerida' : undefined}
                    onClick={(e) => handleSelectDay(slot.day, slot.monthOffset, e)}
                    className={[
                      'h-7 w-full flex items-center justify-center text-[11px] rounded-md transition-all select-none',
                      (!slot.isCurrentMonth || isPast) ? 'opacity-20 text-zinc-500 pointer-events-none' : 'text-zinc-300',
                      isSelected
                        ? 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-900/40'
                        : isSuggested
                        ? 'bg-emerald-500/10 text-emerald-400 font-semibold ring-1 ring-inset ring-emerald-500/20'
                        : 'hover:bg-zinc-800 hover:text-zinc-100',
                      isToday && !isSelected && !isSuggested
                        ? 'text-blue-400 font-semibold ring-1 ring-inset ring-blue-500/30'
                        : '',
                    ].join(' ')}
                  >
                    {slot.day}
                  </button>
                );
              })}
            </div>

            {/* Digitar Manualmente */}
            <div className="mt-3 flex flex-col gap-2 bg-zinc-800/50 rounded-lg px-3 py-2">
              <span className="text-[10px] text-zinc-500 font-medium select-none">Digitar Data/Hora</span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={currentDatePart}
                  max={maxDate ? maxDate.slice(0, 10) : undefined}
                  onChange={(e) => {
                    e.stopPropagation();
                    const newDate = e.target.value;
                    if (enableTime) {
                      onChange(`${newDate}T${currentTimePart}`);
                    } else {
                      onChange(newDate);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent text-zinc-100 text-[11px] font-mono font-semibold outline-none cursor-text [color-scheme:dark] tabular-nums flex-1"
                />
                {enableTime && (
                  <input
                    type="time"
                    value={currentTimePart}
                    onChange={(e) => {
                      e.stopPropagation();
                      const datePartToUse = currentDatePart || (() => {
                        const d = new Date();
                        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                      })();
                      onChange(`${datePartToUse}T${e.target.value || '09:00'}`);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-transparent text-zinc-100 text-[11px] font-mono font-semibold outline-none cursor-text [color-scheme:dark] tabular-nums w-20 border-l border-zinc-700 pl-2"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800/60 bg-zinc-900/50">
            <button
              type="button"
              onClick={handleClear}
              className="text-[10px] font-medium text-zinc-600 hover:text-red-400 transition-colors px-2 py-1 rounded-md hover:bg-red-500/5"
            >
              Excluir
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="text-[10px] font-semibold text-blue-400 hover:text-blue-300 transition-colors px-2.5 py-1 rounded-md bg-blue-500/8 hover:bg-blue-500/15"
            >
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
