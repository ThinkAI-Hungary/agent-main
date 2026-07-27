import { Globe, Sparkles, ArrowRight } from 'lucide-react';
import type { SocialBrand } from '../socialBrandService';

interface Props {
  brands: SocialBrand[];
  onSelectBrand: (brand: SocialBrand) => void;
  onAuditNewPage: () => void;
}

export function BrandSelectionModal({ brands, onSelectBrand, onAuditNewPage }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 20
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 620,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 18,
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 20
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '0 auto', padding: '4px 14px', borderRadius: 20, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', fontSize: 12, fontWeight: 800 }}>
            <Sparkles size={14} />
            <span>Social Planner Munkatér</span>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0 }}>
            Válaszd ki, melyik oldallal szeretnél dolgozni!
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Kérlek válaszd ki a korábban kiértékelt oldalaid közül azt, amelynek a közösségi tartalom-tervezőjét meg szeretnéd nyitni.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, maxHeight: 320, overflowY: 'auto', padding: 2 }}>
          {brands.map(b => (
            <div
              key={b.id}
              onClick={() => onSelectBrand(b)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: 16,
                borderRadius: 14,
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: (b.logo_url || b.domain) ? '#ffffff' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 900,
                  overflow: 'hidden',
                  border: (b.logo_url || b.domain) ? '1px solid var(--border)' : 'none',
                  padding: (b.logo_url || b.domain) ? 4 : 0,
                }}>
                  {b.logo_url || b.domain ? (
                    <img
                      src={b.logo_url || `https://www.google.com/s2/favicons?sz=128&domain=${b.domain}`}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                        const parent = (e.target as HTMLElement).parentElement;
                        if (parent) {
                          parent.style.background = 'linear-gradient(135deg, #3b82f6, #8b5cf6)';
                          parent.style.padding = '0px';
                          parent.style.border = 'none';
                          parent.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
                        }
                      }}
                    />
                  ) : (
                    <Globe size={18} />
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.brand_name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.domain}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, fontSize: 11, fontWeight: 700, color: '#3b82f6', marginTop: 4 }}>
                <span>Megnyitás</span>
                <ArrowRight size={13} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Nem találod amit keresel?</span>
          <button
            onClick={onAuditNewPage}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
              color: '#000',
              border: 'none',
              fontSize: 12.5,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(245,158,11,0.3)'
            }}
          >
            <Sparkles size={15} />
            <span>+ Új oldal kiértékelése</span>
          </button>
        </div>
      </div>
    </div>
  );
}
