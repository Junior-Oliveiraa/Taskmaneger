import React, { useState, useRef, useEffect } from 'react';
import { Ellipsis } from 'lucide-react';
import { TaskPriority } from '../types';
import { PRIORIDADE_INFO, ORDEM_PRIORIDADE } from './TarefaBadges';

interface PriorityPickerProps {
  value: TaskPriority;
  onChange: (priority: TaskPriority) => void;
  trigger?: React.ReactNode;
}

// Visual vindo de TarefaBadges; ordem do menu: sem prioridade → urgente.
const priorities = [...ORDEM_PRIORIDADE].reverse().map(value => {
  const info = PRIORIDADE_INFO[value];
  const Icon = info.icon ?? Ellipsis;
  return {
    value,
    label: info.label,
    badgeStyle: `${info.cls} hover:brightness-125`,
    icon: <Icon size={14} className={`shrink-0 ${info.cor}`} aria-hidden />,
  };
});

export default function PriorityPicker({ value, onChange, trigger }: PriorityPickerProps) {
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

  const handleSelect = (e: React.MouseEvent, val: TaskPriority) => {
    e.stopPropagation();
    onChange(val);
    setIsOpen(false);
  };

  const currentPrio = priorities.find(p => p.value === value) || priorities[0];

  return (
    <div className={`relative ${trigger ? 'inline-flex items-center' : 'w-full'}`} ref={containerRef}>
      {trigger ? (
        <div onClick={handleOpen} className="cursor-pointer flex items-center">
          {trigger}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className={`inline-flex items-center justify-between gap-1.5 text-caption font-sans font-medium px-2 py-1 rounded border min-h-[26px] transition-colors ${currentPrio.badgeStyle} w-full`}
        >
          <div className="flex items-center gap-1.5">
            {currentPrio.icon}
            <span>{currentPrio.label}</span>
          </div>
          <span className="text-caption opacity-60 ml-1">▼</span>
        </button>
      )}

      {isOpen && (
        <div className={`absolute left-0 ${popoverPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} w-44 bg-[#18181b] border border-zinc-800 rounded-md shadow-xl z-50 overflow-hidden animate-fade-in flex flex-col p-1`}>
          <div className="px-2 py-1.5 mb-1 border-b border-zinc-800/80">
            <span className="text-caption font-semibold text-zinc-500">Prioridade</span>
          </div>
          {priorities.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={(e) => handleSelect(e, p.value)}
              className={`flex items-center gap-2 px-2 py-1.5 text-caption font-medium rounded-md transition-colors ${
                value === p.value 
                  ? 'bg-zinc-800 text-zinc-200' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              {p.icon}
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
