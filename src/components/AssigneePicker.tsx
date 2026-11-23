import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface AssigneePickerProps {
  value?: string;
  onChange: (userId: string | undefined) => void;
  trigger?: React.ReactNode;
}

export default function AssigneePicker({ value, onChange, trigger }: AssigneePickerProps) {
  const { allUsers: USERS } = useAuth();
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

  const handleSelect = (e: React.MouseEvent, val: string | undefined) => {
    e.stopPropagation();
    onChange(val);
    setIsOpen(false);
  };

  const currentUser = value ? USERS.find(u => u.id === value) : null;

  return (
    <div className={`relative ${trigger ? 'inline-block' : 'w-full'}`} ref={containerRef}>
      {trigger ? (
        <div onClick={handleOpen} className="cursor-pointer inline-flex">
          {trigger}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center justify-between gap-1.5 text-caption font-sans font-medium px-2 py-1 rounded border text-zinc-300 bg-zinc-500/10 border-zinc-500/20 hover:bg-zinc-500/20 min-h-[26px] transition-colors w-full"
        >
          <div className="flex items-center gap-1.5">
            {currentUser ? (
              <>
                <img src={currentUser.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
                <span>{currentUser.name}</span>
              </>
            ) : (
              <span className="text-zinc-500">Sem responsável</span>
            )}
          </div>
          <span className="text-caption opacity-60 ml-1 text-zinc-500">▼</span>
        </button>
      )}

      {isOpen && (
        <div className={`absolute right-0 ${popoverPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} w-48 bg-[#18181b] border border-zinc-800 rounded-md shadow-xl z-50 overflow-hidden animate-fade-in flex flex-col p-1 max-h-64 overflow-y-auto`}>
          <div className="px-2 py-1.5 mb-1 border-b border-zinc-800/80 shrink-0 sticky top-0 bg-[#18181b] z-10">
            <span className="text-caption font-semibold text-zinc-500">Responsável</span>
          </div>
          
          <button
            type="button"
            onClick={(e) => handleSelect(e, undefined)}
            className={`flex items-center gap-2 px-2 py-2 text-caption font-medium rounded-md transition-colors ${
              !value 
                ? 'bg-zinc-800 text-zinc-200' 
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <div className="w-5 h-5 rounded-full border border-dashed border-zinc-600 flex items-center justify-center bg-zinc-900/50">
              <span className="text-caption text-zinc-500">-</span>
            </div>
            <span>Nenhum</span>
          </button>

          {USERS.map(u => (
            <button
              key={u.id}
              type="button"
              onClick={(e) => handleSelect(e, u.id)}
              className={`flex items-center gap-2 px-2 py-2 text-caption font-medium rounded-md transition-colors ${
                value === u.id 
                  ? 'bg-zinc-800 text-zinc-200' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              <img src={u.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
              <span>{u.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
