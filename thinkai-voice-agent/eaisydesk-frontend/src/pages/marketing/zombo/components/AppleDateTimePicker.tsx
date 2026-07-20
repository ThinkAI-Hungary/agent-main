import React, { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react';

interface AppleDateTimePickerProps {
  value: string;
  onChange: (val: string) => void;
}

export default function AppleDateTimePicker({ value, onChange }: AppleDateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Parse current value or fallback to now
  const initialDate = value ? new Date(value) : new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());

  // Hours / Minutes states
  const [selectedHour, setSelectedHour] = useState(initialDate.getHours());
  const [selectedMinute, setSelectedMinute] = useState(initialDate.getMinutes());

  // Keep internal selection synced with external value changes
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      setSelectedDate(d);
      setViewMonth(d.getMonth());
      setViewYear(d.getFullYear());
      setSelectedHour(d.getHours());
      setSelectedMinute(d.getMinutes());
    }
  }, [value]);

  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update final selected value
  const handleDaySelect = (dayNum: number) => {
    const newD = new Date(selectedDate);
    newD.setFullYear(viewYear);
    newD.setMonth(viewMonth);
    newD.setDate(dayNum);
    newD.setHours(selectedHour);
    newD.setMinutes(selectedMinute);
    setSelectedDate(newD);
    onChange(newD.toISOString());
  };

  const handleTimeChange = (hour: number, minute: number) => {
    setSelectedHour(hour);
    setSelectedMinute(minute);
    const newD = new Date(selectedDate);
    newD.setHours(hour);
    newD.setMinutes(minute);
    setSelectedDate(newD);
    onChange(newD.toISOString());
  };

  // Calendar logic helpers
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
  const adjustedStartDay = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Adjust so Mon is 0

  const monthNames = [
    'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
    'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  // Format value for output field display
  const formatDateDisplay = () => {
    const d = selectedDate;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}. ${monthNames[d.getMonth()]} ${d.getDate()}. ${pad(selectedHour)}:${pad(selectedMinute)}`;
  };

  return (
    <div className="apple-datetime-container" style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      {/* Target input field / button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="apple-datetime-trigger"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--bg3)',
          color: 'var(--text)',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          transition: 'all 0.2s ease',
          userSelect: 'none'
        }}
      >
        <Calendar size={15} style={{ color: 'var(--primary-neon, #8b5cf6)' }} />
        <span style={{ flex: 1 }}>{formatDateDisplay()}</span>
        <Clock size={15} style={{ color: 'var(--text-muted)' }} />
      </div>

      {/* Apple style Popover Dropdown */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="apple-datetime-popover glass-panel"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 1000,
            width: 320,
            padding: 16,
            borderRadius: 16,
            background: 'rgba(10, 8, 20, 0.98)',
            border: '1.5px solid rgba(139, 92, 246, 0.15)',
            boxShadow: '0 10px 30px -5px rgba(0,0,0,0.7), 0 0 15px rgba(139, 92, 246, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            backdropFilter: 'blur(20px)',
            transition: 'all 0.2s ease'
          }}
        >
          {/* Calendar Section */}
          <div>
            {/* Header: Month switcher */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.3px' }}>
                {monthNames[viewMonth]} {viewYear}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="apple-datetime-nav-btn"
                  style={{ border: 'none', background: 'transparent', color: '#fff', padding: 6, cursor: 'pointer', display: 'flex', borderRadius: '50%', transition: 'all 0.2s' }}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="apple-datetime-nav-btn"
                  style={{ border: 'none', background: 'transparent', color: '#fff', padding: 6, cursor: 'pointer', display: 'flex', borderRadius: '50%', transition: 'all 0.2s' }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Days label */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', marginBottom: 6 }}>
              {['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'].map(d => (
                <span key={d} style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', opacity: 0.8 }}>{d}</span>
              ))}
            </div>

            {/* Days grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {/* Empty offset slots */}
              {Array.from({ length: adjustedStartDay }).map((_, i) => (
                <div key={`offset-${i}`} />
              ))}
              {/* Month days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const isSelected = selectedDate.getDate() === dayNum && selectedDate.getMonth() === viewMonth && selectedDate.getFullYear() === viewYear;
                return (
                  <button
                    key={`day-${dayNum}`}
                    type="button"
                    onClick={() => handleDaySelect(dayNum)}
                    className={`apple-datetime-day-btn ${isSelected ? 'selected' : ''}`}
                    style={{
                      border: 'none',
                      borderRadius: '50%',
                      width: 28,
                      height: 28,
                      fontSize: 11,
                      fontWeight: isSelected ? 800 : 500,
                      cursor: 'pointer',
                      background: isSelected ? 'linear-gradient(135deg, var(--primary-neon, #8b5cf6), #db2777)' : 'transparent',
                      color: isSelected ? '#fff' : 'var(--text-main, #f3f4f6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.08)' }} />

          {/* Time Picker Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>
              <Clock size={12} style={{ color: 'var(--primary-neon, #8b5cf6)' }} />
              <span>Időpont választás</span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
              {/* Hours selector */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 700 }}>ÓRA</span>
                <select
                  value={selectedHour}
                  onChange={e => handleTimeChange(parseInt(e.target.value), selectedMinute)}
                  className="apple-datetime-select"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1.5px solid var(--border)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    color: '#fff',
                    fontWeight: 700,
                    outline: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    transition: 'all 0.2s'
                  }}
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={`h-${i}`} value={i} style={{ background: '#110e20', color: '#fff' }}>
                      {i.toString().padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>

              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-muted)', marginTop: 16 }}>:</span>

              {/* Minutes selector */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 700 }}>PERC</span>
                <select
                  value={selectedMinute}
                  onChange={e => handleTimeChange(selectedHour, parseInt(e.target.value))}
                  className="apple-datetime-select"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1.5px solid var(--border)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    color: '#fff',
                    fontWeight: 700,
                    outline: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    transition: 'all 0.2s'
                  }}
                >
                  {Array.from({ length: 12 }).map((_, i) => {
                    const min = i * 5;
                    return (
                      <option key={`m-${min}`} value={min} style={{ background: '#110e20', color: '#fff' }}>
                        {min.toString().padStart(2, '0')}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Done Button */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="apple-datetime-done-btn"
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, var(--primary-neon, #8b5cf6), #6d28d9)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(139,92,246,0.3)',
              transition: 'all 0.2s ease',
              textAlign: 'center'
            }}
          >
            Kész
          </button>
        </div>
      )}

      {/* Embedded CSS for Hover & Responsive style */}
      <style>{`
        .apple-datetime-trigger:hover {
          border-color: var(--primary-neon, #8b5cf6) !important;
          box-shadow: 0 0 10px rgba(139, 92, 246, 0.15) !important;
          transform: translateY(-1px);
        }
        .apple-datetime-trigger:active {
          transform: translateY(0px);
        }
        .apple-datetime-nav-btn:hover {
          background: rgba(255, 255, 255, 0.08) !important;
          color: var(--primary-neon, #8b5cf6) !important;
        }
        .apple-datetime-day-btn:not(.selected):hover {
          background: rgba(139, 92, 246, 0.15) !important;
          color: #fff !important;
          transform: scale(1.1);
        }
        .apple-datetime-select:hover {
          border-color: var(--primary-neon, #8b5cf6) !important;
          background: rgba(255, 255, 255, 0.08) !important;
        }
        .apple-datetime-done-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 15px rgba(139, 92, 246, 0.5) !important;
        }
        .apple-datetime-done-btn:active {
          transform: translateY(0);
        }
        @media (max-width: 480px) {
          .apple-datetime-popover {
            width: 290px !important;
            padding: 12px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
          }
          .apple-datetime-day-btn {
            width: 26px !important;
            height: 26px !important;
            fontSize: 10px !important;
          }
        }
      `}</style>
    </div>
  );
}
