import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Repeat, ChevronDown, Check, X } from 'lucide-react';
import { RoutineConfig } from '../types';
import { BOTAO_ICONE, encaixar, FOCO } from './tarefa/Propriedade';

interface RoutinePropertiesProps {
  routine?: RoutineConfig;
  onChange: (update: RoutineConfig | undefined) => void;
  align?: 'left' | 'right';
  disabled?: boolean;
}

const WEEKDAYS = [
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
];

export default function RoutineProperties({ routine, onChange, align = 'right', disabled }: RoutinePropertiesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (isOpen) encaixar(painelRef.current); }, [isOpen]);

  // Local state for edits
  const [type, setType] = useState<'interval' | 'weekdays'>(routine?.type || 'interval');
  const [intervalValue, setIntervalValue] = useState<number>(routine?.intervalValue || 1);
  const [intervalUnit, setIntervalUnit] = useState<'days' | 'weeks' | 'months'>(routine?.intervalUnit || 'days');
  const [weekdays, setWeekdays] = useState<number[]>(routine?.weekdays || []);
  const [isUnitDropdownOpen, setIsUnitDropdownOpen] = useState(false);
  const unitDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    // Esc fecha só a configuração, não o painel da tarefa.
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc, true);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutsideUnit = (event: MouseEvent) => {
      if (unitDropdownRef.current && !unitDropdownRef.current.contains(event.target as Node)) {
        setIsUnitDropdownOpen(false);
      }
    };

    if (isUnitDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutsideUnit);
    }
    return () => document.removeEventListener('mousedown', handleClickOutsideUnit);
  }, [isUnitDropdownOpen]);

  const handleSave = () => {
    onChange({
      active: true,
      type,
      intervalValue: type === 'interval' ? intervalValue : undefined,
      intervalUnit: type === 'interval' ? intervalUnit : undefined,
      weekdays: type === 'weekdays' ? weekdays : undefined,
      lastDuplicatedAt: new Date().toISOString(), // Inicia a contagem de agora
    });
    setIsOpen(false);
  };

  const toggleWeekday = (day: number) => {
    setWeekdays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const activeLabel = routine?.active ? (
    routine.type === 'interval' ? `A cada ${routine.intervalValue} ${(routine.intervalUnit === 'days' ? ['dia', 'dias'] : routine.intervalUnit === 'weeks' ? ['semana', 'semanas'] : ['mês', 'meses'])[routine.intervalValue === 1 ? 0 : 1]}` :
    `Dias: ${WEEKDAYS.filter(d => (routine.weekdays || []).includes(d.value)).map(d => d.label.substring(0,3)).join(', ')}`
  ) : null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={activeLabel ? `Rotina: ${activeLabel}` : 'Criar rotina'}
        title={activeLabel ? `Rotina · ${activeLabel}` : 'Criar rotina'}
        className={`${BOTAO_ICONE} ${activeLabel ? '!bg-blue-500/10 !text-blue-400 hover:!bg-blue-500/20' : ''}`}
      >
        <Repeat size={16} aria-hidden />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={painelRef}
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={`absolute top-full mt-2 w-72 bg-[#18181b] border border-white/10 rounded-xl shadow-[0_12px_32px_rgb(0_0_0/0.28)] z-50 ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            <div className="px-4 py-3 border-b border-zinc-900">
              <h3 className="text-body font-semibold text-zinc-100 flex items-center gap-2">
                <Repeat size={14} className="text-zinc-400" aria-hidden />
                Configurar rotina
              </h3>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex gap-0.5 p-0.5 bg-[#0c0c0e] border border-zinc-900 rounded-lg">
                <button
                  onClick={() => setType('interval')}
                  className={`flex-1 h-8 text-body font-medium rounded-md transition-colors ${FOCO} ${
                    type === 'interval' ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  Intervalo
                </button>
                <button
                  onClick={() => setType('weekdays')}
                  className={`flex-1 h-8 text-body font-medium rounded-md transition-colors ${FOCO} ${
                    type === 'weekdays' ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  Dias da semana
                </button>
              </div>

              {type === 'interval' ? (
                <div className="space-y-3">
                  <label className="text-body text-zinc-400 block mb-1">Repetir a cada:</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      value={intervalValue}
                      onChange={(e) => setIntervalValue(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 bg-[#0c0c0e] border border-zinc-800 rounded-lg px-2 py-1.5 text-body text-center text-zinc-100 focus:outline-none focus:border-blue-500/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <div className="relative flex-1" ref={unitDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsUnitDropdownOpen(!isUnitDropdownOpen)}
                        className="w-full flex items-center justify-between bg-[#0c0c0e] border border-zinc-800 rounded-lg px-2 py-1.5 text-body text-zinc-100 hover:border-zinc-700 transition-colors focus:outline-none focus:border-blue-500/60"
                      >
                        <span>{intervalUnit === 'days' ? 'Dia(s)' : intervalUnit === 'weeks' ? 'Semana(s)' : 'Mês(es)'}</span>
                        <ChevronDown size={12} className="opacity-50" />
                      </button>
                      
                      <AnimatePresence>
                        {isUnitDropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            transition={{ duration: 0.1 }}
                            className="absolute top-full left-0 w-full mt-1 bg-[#18181b] border border-white/10 rounded-lg shadow-2xl py-1 z-50 overflow-hidden"
                          >
                            {[
                              { value: 'days', label: 'Dia(s)' },
                              { value: 'weeks', label: 'Semana(s)' },
                              { value: 'months', label: 'Mês(es)' }
                            ].map(option => (
                              <button
                                key={option.value}
                                onClick={() => {
                                  setIntervalUnit(option.value as any);
                                  setIsUnitDropdownOpen(false);
                                }}
                                className={`w-full text-left px-3 py-1.5 text-body transition-colors hover:bg-[#1F1F22] ${
                                  intervalUnit === option.value ? 'text-zinc-100 bg-[#1F1F22]' : 'text-zinc-300'
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-body text-zinc-400">Repetir toda:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {WEEKDAYS.map(day => (
                      <button
                        key={day.value}
                        onClick={() => toggleWeekday(day.value)}
                        className={`flex items-center gap-2 px-2 h-9 rounded-lg border text-body transition-colors ${
                          weekdays.includes(day.value)
                            ? 'bg-blue-500/10 border-blue-500/30 text-zinc-100'
                            : 'bg-[#0c0c0e] border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        <div className={`w-3 h-3 rounded-sm flex items-center justify-center border ${
                          weekdays.includes(day.value) ? 'bg-blue-600 border-blue-600' : 'border-zinc-600'
                        }`}>
                          {weekdays.includes(day.value) && <Check size={10} className="text-white" />}
                        </div>
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-zinc-900 flex justify-between items-center">
              {routine?.active ? (
                <button
                  onClick={() => {
                    onChange(undefined);
                    setIsOpen(false);
                  }}
                  className="h-8 -ml-2 px-2 rounded-lg text-body font-medium text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1"
                >
                  <X size={14} />
                  Desativar
                </button>
              ) : (
                <div />
              )}
              <button
                onClick={handleSave}
                disabled={type === 'weekdays' && weekdays.length === 0}
                className="h-8 px-4 text-body font-medium btn-brand rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Salvar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
