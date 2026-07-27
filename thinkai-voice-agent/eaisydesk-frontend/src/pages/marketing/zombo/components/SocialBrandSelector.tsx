import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Globe, Plus, Check, Sparkles } from 'lucide-react';
import type { SocialBrand } from '../socialBrandService';
import { fetchSocialBrands } from '../socialBrandService';
import { useAuth } from '../../../../context/AuthContext';

interface Props {
  activeBrand: SocialBrand | null;
  onSelectBrand: (brand: SocialBrand) => void;
  onAuditNewPage: () => void;
}

export function SocialBrandSelector({ activeBrand, onSelectBrand, onAuditNewPage }: Props) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [brands, setBrands] = useState<SocialBrand[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadBrands = async () => {
    setLoading(true);
    const ownerId = user?.username || 'local_admin';
    const list = await fetchSocialBrands(ownerId);
    setBrands(list);
    setLoading(false);
  };

  useEffect(() => {
    loadBrands();
  }, [activeBrand, isOpen, user]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          loadBrands();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          borderRadius: 20,
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          fontSize: 12.5,
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: (activeBrand?.logo_url || activeBrand?.domain) ? '#ffffff' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: (activeBrand?.logo_url || activeBrand?.domain) ? 'var(--text)' : '#fff',
            fontSize: 11,
            fontWeight: 800,
            overflow: 'hidden',
            flexShrink: 0,
            border: (activeBrand?.logo_url || activeBrand?.domain) ? '1px solid var(--border)' : 'none',
            padding: (activeBrand?.logo_url || activeBrand?.domain) ? 2 : 0,
          }}
        >
          {activeBrand?.logo_url || activeBrand?.domain ? (
            <img
              src={activeBrand.logo_url || `https://www.google.com/s2/favicons?sz=128&domain=${activeBrand.domain}`}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
                const parent = (e.target as HTMLElement).parentElement;
                if (parent) {
                  parent.style.background = 'linear-gradient(135deg, #3b82f6, #8b5cf6)';
                  parent.style.color = '#fff';
                  parent.style.padding = '0px';
                  parent.style.border = 'none';
                  parent.innerText = activeBrand.domain.charAt(0).toUpperCase();
                }
              }}
            />
          ) : (
            'S'
          )}
        </div>

        <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeBrand ? activeBrand.brand_name || activeBrand.domain : 'Válassz oldalt'}
        </span>

        <ChevronDown size={14} style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 260,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            zIndex: 9999,
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2
          }}
        >
          <div style={{ padding: '6px 10px 4px 10px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            Kiértékelt Oldalak ({brands.length})
          </div>

          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {loading ? (
              <div style={{ padding: 12, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>Betöltés...</div>
            ) : brands.length === 0 ? (
              <div style={{ padding: 12, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>Még nincs kiértékelt oldal</div>
            ) : (
              brands.map(b => {
                const isSelected = activeBrand?.id === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => {
                      onSelectBrand(b);
                      setIsOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: 'none',
                      background: isSelected ? 'rgba(59,130,246,0.12)' : 'transparent',
                      color: isSelected ? '#3b82f6' : 'var(--text)',
                      fontSize: 12,
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                      <Globe size={14} style={{ color: isSelected ? '#3b82f6' : 'var(--text-muted)', flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.brand_name}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.domain}</span>
                      </div>
                    </div>
                    {isSelected && <Check size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />}
                  </button>
                );
              })
            )}
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

          <button
            onClick={() => {
              setIsOpen(false);
              onAuditNewPage();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.15))',
              color: '#f59e0b',
              fontSize: 11.5,
              fontWeight: 800,
              cursor: 'pointer',
              justifyContent: 'center'
            }}
          >
            <Sparkles size={14} />
            <span>+ Új oldal kiértékelése</span>
          </button>
        </div>
      )}
    </div>
  );
}
