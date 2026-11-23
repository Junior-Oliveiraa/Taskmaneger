import React, { useState, useRef, useEffect } from 'react';
import { TaskStatus } from '../types';
import { STATUS_INFO, ORDEM_STATUS, StatusIcone } from './TarefaBadges';

interface StatusPickerProps {
  value: TaskStatus;
  onChange: (status: TaskStatus) => void;
  trigger?: React.ReactNode;
}

// Rótulos e ícones vêm de TarefaBadges (mesma cara em todas as vistas).
const statuses = ORDEM_STATUS.map(value => ({ value, label: STATUS_INFO[value].label }));

export default function StatusPicker({ value, onChange, trigger }: StatusPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [popoverPosition, setPopoverPosition] = useState<'top' | 'bottom'>('bottom');

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      if (spaceBelow < 280 && spaceAbove > spaceBelow) {
        setPopoverPosition('top');
      } else {
        setPopoverPosition('bottom');
      }
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleSelect = (e: React.MouseEvent, val: TaskStatus) => {
    e.stopPropagation();
    onChange(val);
    setIsOpen(false);
  };

  const currentStatus = statuses.find(s => s.value === value) || statuses[0];

  return (
    <div className={`relative ${trigger ? 'inline-block' : 'w-full'}`} ref={containerRef}>
      {trigger ? (
        <div onClick={handleOpen} className="cursor-pointer inline-flex w-full">
          {trigger}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center justify-between gap-1.5 text-caption font-sans font-medium px-2 py-1 rounded border text-zinc-300 bg-zinc-500/10 border-zinc-500/20 hover:bg-zinc-500/20 min-h-[26px] transition-colors w-full"
        >
          <div className="flex items-center gap-1.5">
            <StatusIcone status={currentStatus.value} size={12} />
            <span>{currentStatus.label}</span>
          </div>
          <span className="text-caption opacity-60 ml-1 text-zinc-500">▼</span>
        </button>
      )}

      {isOpen && (
        <div className={`absolute left-0 ${popoverPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} w-44 bg-[#18181b] border border-zinc-800 rounded-md shadow-xl z-50 overflow-hidden animate-fade-in flex flex-col p-1 max-h-64 overflow-y-auto`}>
          <div className="px-2 py-1.5 mb-1 border-b border-zinc-800/80 shrink-0 sticky top-0 bg-[#18181b] z-10">
            <span className="text-caption font-semibold text-zinc-500">Status da Tarefa</span>
          </div>

          {statuses.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={(e) => handleSelect(e, s.value)}
              className={`flex items-center gap-2 px-2 py-2 text-caption font-medium rounded-md transition-colors ${
                value === s.value 
                  ? 'bg-zinc-800 text-zinc-200' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              <StatusIcone status={s.value} size={13} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
