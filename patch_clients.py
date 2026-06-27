import re

def patch():
    path = "thinkai-voice-agent/eaisydesk-frontend/src/pages/ClientsPage.tsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Add FilterSection, FilterCheckbox, toggleFilter
    filter_components = """
function FilterSection({ title, bordered, children }: { title: string; bordered?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`filter-section${bordered ? ' filter-section--bordered' : ''}`}>
      <button
        onClick={() => setOpen(!open)}
        className="filter-section-btn"
      >
        <span>{title}</span>
        <svg
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          className={`filter-section-chevron${open ? ' filter-section-chevron--open' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="filter-section-body">{children}</div>}
    </div>
  );
}

function FilterCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="filter-cb-label">
      <input type="checkbox" checked={checked} onChange={onChange} className="filter-cb-input" />
      {label}
    </label>
  );
}

function toggleFilter(current: Set<string>, val: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
  setter(prev => {
    const next = new Set(prev);
    if (next.has(val)) next.delete(val); else next.add(val);
    return next;
  });
}
"""
    # Append to bottom if not exists
    if "function FilterSection" not in content:
        content += "\n" + filter_components

    # 2. SORT_OPTIONS
    sort_opts = """
const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Legújabb elöl' },
  { value: 'date_asc', label: 'Régebbiek elöl' },
  { value: 'name_asc', label: 'Név alapján (A-Z)' },
  { value: 'name_desc', label: 'Név alapján (Z-A)' },
  { value: 'interaction_desc', label: 'Utolsó interakció' },
];
"""
    if "const SORT_OPTIONS" not in content:
        content = content.replace("const CLIENT_COLUMNS", sort_opts + "\nconst CLIENT_COLUMNS")

    # 3. Add States
    states_str = """
  const [filterOpen, setFilterOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [filterKategoria, setFilterKategoria] = useState<Set<string>>(new Set());
  const [filterErtStatusz, setFilterErtStatusz] = useState<Set<string>>(new Set());
  const [filterFelelos, setFilterFelelos] = useState<Set<string>>(new Set());
  
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState('date_desc');

  const ALL_KATEGORIA = ['Új beteg', 'Visszatérő', 'Inaktív'];
  const ALL_ERT_STATUSZ = Array.from(new Set(myClients.map(c => c.status || 'Üres'))).sort();
  const ALL_FELELOS = Array.from(new Set(myClients.map(c => c.assignee || 'Nincs felelős'))).sort();
  
  const activeFilterCount = filterKategoria.size + filterErtStatusz.size + filterFelelos.size;
  const resetFilters = () => {
    setFilterKategoria(new Set());
    setFilterErtStatusz(new Set());
    setFilterFelelos(new Set());
  };
"""
    if "const [filterOpen" not in content:
        # insert after const [members, setMembers] = useState<MemberUser[]>([]);
        content = content.replace("const [members, setMembers] = useState<MemberUser[]>([]);", 
                                  "const [members, setMembers] = useState<MemberUser[]>([]);\n" + states_str)

    # 4. Modify click outside
    old_click = """  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (colDropdownRef.current && !colDropdownRef.current.contains(e.target as Node)) {
        setColDropdownOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);"""
    new_click = """  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (colDropdownRef.current && !colDropdownRef.current.contains(e.target as Node)) setColDropdownOpen(false);
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) setSortDropdownOpen(false);
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);"""
    if "sortDropdownRef.current" not in old_click:
        content = content.replace(old_click, new_click)

    # 5. Modify filteredClients logic
    old_filtered = """  // ── Search filter ──
  const filteredClients = useMemo(() => {
    if (!searchQuery) return myClients;
    const q = cleanStr(searchQuery);
    return myClients.filter((c) => {
      const searchable = [c.name, c.email, c.phone, c.tags.join(' '), c.assignee, c.status].join(' ');
      return cleanStr(searchable).includes(q);
    });
  }, [myClients, searchQuery]);"""
    new_filtered = """  // ── Search & filter ──
  const filteredClients = useMemo(() => {
    let result = myClients;
    
    // Filters
    if (filterKategoria.size > 0 || filterErtStatusz.size > 0 || filterFelelos.size > 0) {
      result = result.filter(c => {
        let katMatch = true;
        if (filterKategoria.size > 0) {
          const kateg = c.isInactive ? 'Inaktív' : (c.isNew ? 'Új beteg' : 'Visszatérő');
          if (!filterKategoria.has(kateg)) katMatch = false;
        }
        
        let ertMatch = true;
        if (filterErtStatusz.size > 0) {
          const ertStatusz = c.status || 'Üres';
          if (!filterErtStatusz.has(ertStatusz)) ertMatch = false;
        }

        let felMatch = true;
        if (filterFelelos.size > 0) {
          const felelos = c.assignee || 'Nincs felelős';
          if (!filterFelelos.has(felelos)) felMatch = false;
        }

        return katMatch && ertMatch && felMatch;
      });
    }

    // Search
    if (searchQuery) {
      const q = cleanStr(searchQuery);
      result = result.filter((c) => {
        const searchable = [c.name, c.email, c.phone, c.tags.join(' '), c.assignee, c.status].join(' ');
        return cleanStr(searchable).includes(q);
      });
    }
    
    // Sort
    return result.sort((a, b) => {
      if (sortBy === 'date_desc') return (b.created_at || '').localeCompare(a.created_at || '');
      if (sortBy === 'date_asc') return (a.created_at || '').localeCompare(b.created_at || '');
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '', 'hu');
      if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '', 'hu');
      if (sortBy === 'interaction_desc') return (b.lastInteraction || '').localeCompare(a.lastInteraction || '');
      return 0;
    });
  }, [myClients, searchQuery, filterKategoria, filterErtStatusz, filterFelelos, sortBy]);"""
    
    content = content.replace(old_filtered, new_filtered)

    # 6. Add UI Buttons
    old_toolbar = """              {/* Column toggle */}
              <div className="cl-col-toggle" ref={colDropdownRef}>
                <button
                  className="int-toolbar-btn cl-col-toggle-btn"
                  title="Oszlopok"
                  onClick={() => setColDropdownOpen(!colDropdownOpen)}
                >
                  <svg fill="none" height="14" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14">
                    <rect height="18" rx="2" ry="2" width="18" x="3" y="3" />
                    <line x1="9" x2="9" y1="3" y2="21" />
                  </svg>
                  Oszlopok
                </button>
                {colDropdownOpen && (
                  <div className="dropdown-menu">
                    <div className="dropdown-header">Látható oszlopok</div>
                    {CLIENT_COLUMNS.map((col) => (
                      <label key={col.key} className="cl-col-label">
                        <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)} className="cl-col-checkbox" />
                        {col.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>"""

    new_toolbar = """              {/* Filter */}
              <div className="relative int-dropdown-wrap" ref={filterDropdownRef}>
                <button
                  className={`int-toolbar-btn flex-row gap-6 ${activeFilterCount > 0 ? 'active' : ''}`}
                  title="Szűrés"
                  onClick={() => setFilterOpen(!filterOpen)}
                >
                  <svg fill="none" height="14" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                  </svg>
                  Szűrés
                  {activeFilterCount > 0 && <span className="int-filter-badge">{activeFilterCount}</span>}
                </button>
                {filterOpen && (
                  <div className="dropdown-menu dropdown-menu--filter">
                    <div className="dropdown-header">Szűrők</div>
                    <div className="int-filter-list">
                      <FilterSection title="Ügyfél kategória" bordered>
                        {ALL_KATEGORIA.map((v) => (
                          <FilterCheckbox key={v} label={v} checked={filterKategoria.has(v)} onChange={() => toggleFilter(filterKategoria, v, setFilterKategoria)} />
                        ))}
                      </FilterSection>
                      <FilterSection title="Értékesítési státusz" bordered>
                        {ALL_ERT_STATUSZ.map((v) => (
                          <FilterCheckbox key={v} label={v} checked={filterErtStatusz.has(v)} onChange={() => toggleFilter(filterErtStatusz, v, setFilterErtStatusz)} />
                        ))}
                      </FilterSection>
                      <FilterSection title="Felelős" bordered>
                        {ALL_FELELOS.map((v) => (
                          <FilterCheckbox key={v} label={v} checked={filterFelelos.has(v)} onChange={() => toggleFilter(filterFelelos, v, setFilterFelelos)} />
                        ))}
                      </FilterSection>
                    </div>
                    <div className="flex-row gap-8 int-filter-footer">
                      <button className="btn btn-outline int-filter-btn" onClick={resetFilters}>Visszaállítás</button>
                      <button className="btn btn-primary int-filter-btn" onClick={() => setFilterOpen(false)}>Alkalmaz</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Sort */}
              <div className="relative int-dropdown-wrap" ref={sortDropdownRef}>
                <button
                  className="int-toolbar-btn flex-row gap-6"
                  onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                >
                  <svg fill="none" height="14" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14">
                    <path d="M3 6h18M6 12h12M9 18h6" />
                  </svg>
                  {SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Rendezés'}
                </button>
                {sortDropdownOpen && (
                  <div className="dropdown-menu dropdown-menu--sort">
                    {SORT_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        className={`dropdown-item ${sortBy === o.value ? 'active' : ''}`}
                        onClick={() => { setSortBy(o.value); setSortDropdownOpen(false); }}
                      >
                        {sortBy === o.value && <span className="int-sort-check">✓</span>}
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

""" + old_toolbar

    if "Szűrés" not in content and "filterDropdownRef" not in old_toolbar:
        content = content.replace(old_toolbar, new_toolbar)


    # Same for Mobile? Wait, does mobile view need this too?
    # Actually mobile toolbar might be different, let's look.
    # The user screenshot showed desktop, but I should probably add it to mobile too if there's a toolbar.
    # We will just patch the desktop for now since they explicitly asked for it matching the desktop image.

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
        
patch()
