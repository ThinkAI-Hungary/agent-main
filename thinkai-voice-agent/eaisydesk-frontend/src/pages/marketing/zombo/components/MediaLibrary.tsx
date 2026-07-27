import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../context/AuthContext';
import { useAudit } from '../../../../context/AuditContext';
import { showToast } from '../../../../components/ui/Toast';
import { getBackendUrl } from '../types';
import {
  Folder,
  File,
  FolderPlus,
  Upload,
  Trash2,
  Download
} from 'lucide-react';

interface MediaLibraryProps {
  onSelect?: (url: string) => void;
  isSelectorMode?: boolean;
  brandId?: string | null;
}

export function MediaLibrary({ onSelect, isSelectorMode = false, brandId = null }: MediaLibraryProps) {
  const { user } = useAuth();
  const { result } = useAudit();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [allFolders, setAllFolders] = useState<any[]>([]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Record<string, boolean>>({});
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'gallery' | 'logos'>('gallery');

  // Modal / CRUD state
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');

  // AI sorting state
  const [isSorting, setIsSorting] = useState(false);
  const [isSortConfirmOpen, setIsSortConfirmOpen] = useState(false);

  // Upload AI sorting options
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [isUploadConfirmOpen, setIsUploadConfirmOpen] = useState(false);

  // Image preview overlay
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Fetch all folders for the sidebar tree
  const fetchAllFolders = useCallback(async (subTab: 'gallery' | 'logos') => {
    if (!brandId) {
      setAllFolders([]);
      return;
    }
    try {
      let query = supabase.from('media_folders').select('*').eq('brand_id', brandId);
      if (subTab === 'gallery') {
        query = query.or('is_logo.is.null,is_logo.eq.false');
      } else {
        query = query.eq('is_logo', true);
      }
      const { data, error } = await query.order('name');
      if (error) throw error;
      setAllFolders(data || []);
    } catch (err) {
      console.error('Error fetching all folders for tree:', err);
    }
  }, [brandId]);

  // Fetch function for current folder contents
  const fetchCurrentFolderContents = useCallback(async (folderId: string | null, subTab: 'gallery' | 'logos') => {
    if (!brandId) {
      setFolders([]);
      setFiles([]);
      return;
    }
    setLoading(true);
    try {
      // 1. Fetch folders
      let foldersQuery = supabase.from('media_folders').select('*').eq('brand_id', brandId);
      if (subTab === 'gallery') {
        foldersQuery = foldersQuery.or('is_logo.is.null,is_logo.eq.false');
      } else {
        foldersQuery = foldersQuery.eq('is_logo', true);
      }
      
      if (folderId === null) {
        foldersQuery = foldersQuery.is('parent_id', null);
      } else {
        foldersQuery = foldersQuery.eq('parent_id', folderId);
      }
      const { data: folderData, error: folderErr } = await foldersQuery.order('name');
      if (folderErr) throw folderErr;
      setFolders(folderData || []);

      // 2. Fetch files
      let filesQuery = supabase.from('media_files').select('*').eq('brand_id', brandId);
      if (subTab === 'gallery') {
        filesQuery = filesQuery.or('is_logo.is.null,is_logo.eq.false');
      } else {
        filesQuery = filesQuery.eq('is_logo', true);
      }

      if (folderId === null) {
        filesQuery = filesQuery.is('folder_id', null);
      } else {
        filesQuery = filesQuery.eq('folder_id', folderId);
      }
      const { data: fileData, error: fileErr } = await filesQuery.order('created_at', { ascending: false });
      if (fileErr) throw fileErr;
      setFiles(fileData || []);
    } catch (err: any) {
      console.error('Error fetching media contents:', err);
      showToast('Hiba történt a fájlok betöltésekor: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    fetchCurrentFolderContents(currentFolderId, activeSubTab);
    fetchAllFolders(activeSubTab);
  }, [currentFolderId, activeSubTab, fetchCurrentFolderContents, fetchAllFolders]);

  // Automatically sync scraped logos when component mounts or brand/result changes
  useEffect(() => {
    if (brandId && result) {
      const logoUrls = new Set<string>();
      const primaryLogo = result.visuals?.logo_analysis?.primary_logo?.url;
      if (primaryLogo && primaryLogo.trim()) logoUrls.add(primaryLogo.trim());
      
      const breakdownLogos = result.visuals?.logo_analysis?.logos_breakdown || [];
      breakdownLogos.forEach((logo: any) => {
        if (logo && logo.url && logo.url.trim()) {
          logoUrls.add(logo.url.trim());
        }
      });

      if (logoUrls.size > 0) {
        supabase.from('media_files')
          .select('url')
          .eq('brand_id', brandId)
          .eq('is_logo', true)
          .then(({ data: existingFiles }) => {
            const existingUrls = new Set((existingFiles || []).map(f => f.url));
            const uniqueNewLogoUrls = Array.from(logoUrls).filter(url => !existingUrls.has(url));
            
            if (uniqueNewLogoUrls.length > 0) {
              const logoInserts = uniqueNewLogoUrls.map((logoUrl: string) => {
                const name = logoUrl.split('/').pop()?.split('?')[0] || 'scraped_logo.png';
                return {
                  name,
                  url: logoUrl,
                  is_logo: true,
                  brand_id: brandId,
                  user_id: user?.id || null,
                  type: 'image/png',
                  size: 0
                };
              });
              
              supabase.from('media_files').insert(logoInserts).then(({ error: insertErr }) => {
                if (!insertErr) {
                  console.log('[LIBRARY-AUTO-SYNC] Scraped logos synchronized to database.');
                  fetchCurrentFolderContents(currentFolderId, activeSubTab);
                } else {
                  console.error('[LIBRARY-AUTO-SYNC] Error inserting:', insertErr);
                }
              });
            }
          });
      }
    }
  }, [brandId, result, user, currentFolderId, activeSubTab, fetchCurrentFolderContents]);

  // Folder CRUD handlers
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const { error } = await supabase.from('media_folders').insert({
        name: newFolderName.trim(),
        parent_id: currentFolderId,
        user_id: user?.id || null,
        brand_id: brandId,
        is_logo: activeSubTab === 'logos'
      });
      if (error) throw error;
      showToast('Mappa sikeresen létrehozva!');
      setNewFolderName('');
      setIsCreateFolderOpen(false);
      fetchCurrentFolderContents(currentFolderId, activeSubTab);
      fetchAllFolders(activeSubTab);
    } catch (err: any) {
      showToast('Nem sikerült létrehozni a mappát: ' + err.message);
    }
  };

  const handleRenameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameFolderId || !renameFolderName.trim()) return;
    try {
      const { error } = await supabase.from('media_folders').update({
        name: renameFolderName.trim()
      }).eq('id', renameFolderId);
      if (error) throw error;
      showToast('Mappa sikeresen átnevezve!');
      setRenameFolderId(null);
      setRenameFolderName('');
      fetchCurrentFolderContents(currentFolderId, activeSubTab);
      fetchAllFolders(activeSubTab);
    } catch (err: any) {
      showToast('Nem sikerült átnevezni a mappát: ' + err.message);
    }
  };

  const handleDeleteFolder = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`Biztosan törölni szeretnéd a(z) "${name}" mappát és az összes tartalmát?`)) return;
    try {
      const { error } = await supabase.from('media_folders').delete().eq('id', id);
      if (error) throw error;
      showToast('Mappa törölve.');
      
      // If we are currently inside this folder or its subfolders, navigate back to root
      if (currentFolderId === id) {
        setCurrentFolderId(null);
        setBreadcrumbs([]);
      }
      
      fetchCurrentFolderContents(currentFolderId === id ? null : currentFolderId, activeSubTab);
      fetchAllFolders(activeSubTab);
    } catch (err: any) {
      showToast('Nem sikerült törölni a mappát: ' + err.message);
    }
  };

  const handleDeleteFile = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Biztosan törölni szeretnéd ezt a képet?')) return;
    try {
      const { error } = await supabase.from('media_files').delete().eq('id', id);
      if (error) throw error;
      showToast('Fájl törölve.');
      fetchCurrentFolderContents(currentFolderId, activeSubTab);
    } catch (err: any) {
      showToast('Nem sikerült törölni a fájlt: ' + err.message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;
    
    const fileList: File[] = [];
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      if (file.type.startsWith('image/')) {
        fileList.push(file);
      } else {
        showToast(`Fájl kihagyva: ${file.name} (csak képeket lehet feltölteni).`);
      }
    }

    if (fileList.length === 0) {
      if (e.target) e.target.value = '';
      return;
    }

    setPendingUploadFiles(fileList);
    setIsUploadConfirmOpen(true);
    if (e.target) e.target.value = '';
  };

  const executeUpload = async (shouldSort: boolean) => {
    if (pendingUploadFiles.length === 0) return;
    setIsUploadConfirmOpen(false);
    setUploading(true);
    
    const newlyUploadedFiles: { id: string; url: string }[] = [];
    
    try {
      // 1. Upload files
      for (const file of pendingUploadFiles) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const backendUrl = getBackendUrl();
        const uploadResp = await fetch(`${backendUrl}/marketing/api/zombo/upload-base64`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, filename: file.name }),
        });

        if (!uploadResp.ok) throw new Error(await uploadResp.text());
        const uploadData = await uploadResp.json();

        const { data: dbFile, error } = await supabase.from('media_files').insert({
          name: file.name.replace(/\.[^/.]+$/, "") + ".webp",
          url: uploadData.url,
          folder_id: activeSubTab === 'logos' ? null : currentFolderId,
          size: file.size,
          type: 'image/webp',
          user_id: user?.id || null,
          brand_id: brandId,
          is_logo: activeSubTab === 'logos'
        }).select().single();
        
        if (error) throw error;
        if (dbFile) {
          newlyUploadedFiles.push({ id: dbFile.id, url: dbFile.url });
        }
      }

      showToast(`${pendingUploadFiles.length} kép sikeresen feltöltve!`);

      // 2. If smart sort requested, classify and sort ONLY the newly uploaded files
      if (shouldSort && newlyUploadedFiles.length > 0 && brandId) {
        setIsSorting(true);
        const existingFolderNames = allFolders.map(f => f.name);

        const backendUrl = getBackendUrl();
        const sortResp = await fetch(`${backendUrl}/marketing/api/zombo/smart-sort`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: newlyUploadedFiles,
            existingFolderNames
          })
        });

        if (!sortResp.ok) {
          throw new Error(await sortResp.text());
        }

        const sortData = await sortResp.json();
        if (sortData.success) {
          const mappings = sortData.mappings || [];
          let processedCount = 0;
          const localFolderCache: Record<string, string> = {};
          allFolders.forEach(f => {
            localFolderCache[f.name.toLowerCase()] = f.id;
          });

          for (const mapping of mappings) {
            const cat = mapping.category;
            const fileId = mapping.fileId;
            const lowerCat = cat.toLowerCase();
            let folderId = localFolderCache[lowerCat];

            if (!folderId) {
              const { data: newFolder, error: insertErr } = await supabase
                .from('media_folders')
                .insert({
                  name: cat,
                  brand_id: brandId,
                  user_id: user?.id || null,
                  is_logo: activeSubTab === 'logos'
                })
                .select()
                .single();

              if (insertErr) {
                console.error('[SMART-SORT-UPLOAD] Folder insert error:', insertErr);
                continue;
              }

              folderId = newFolder.id;
              localFolderCache[lowerCat] = folderId;
            }

            const { error: updateErr } = await supabase
              .from('media_files')
              .update({ folder_id: folderId })
              .eq('id', fileId);

            if (!updateErr) {
              processedCount++;
            }
          }
          showToast(`AI szortírozás befejezve! ${processedCount} kép elrendezve.`);
        }
      }
    } catch (err: any) {
      console.error(err);
      showToast('Hiba a feltöltés vagy szortírozás közben: ' + err.message);
    } finally {
      setUploading(false);
      setIsSorting(false);
      setPendingUploadFiles([]);
      fetchCurrentFolderContents(currentFolderId, activeSubTab);
      fetchAllFolders(activeSubTab);
    }
  };

  const enterFolder = (id: string, name: string) => {
    setCurrentFolderId(id);
    setBreadcrumbs(prev => [...prev, { id, name }]);
  };

  const navigateBreadcrumb = (idx: number) => {
    if (idx === -1) {
      setCurrentFolderId(null);
      setBreadcrumbs([]);
    } else {
      const target = breadcrumbs[idx];
      setCurrentFolderId(target.id);
      setBreadcrumbs(breadcrumbs.slice(0, idx + 1));
    }
  };

  useEffect(() => {
    if (previewImageUrl) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [previewImageUrl]);

  const handleDownloadFile = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = url.split('/').pop() || 'media-item';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleSmartSort = async () => {
    if (!brandId) return;
    setIsSortConfirmOpen(false);
    setIsSorting(true);
    try {
      // 1. Fetch only root files (folder_id is null) for the brand/tab
      let rootFilesQuery = supabase
        .from('media_files')
        .select('id, name, url')
        .eq('brand_id', brandId)
        .is('folder_id', null);

      if (activeSubTab === 'gallery') {
        rootFilesQuery = rootFilesQuery.or('is_logo.is.null,is_logo.eq.false');
      } else {
        rootFilesQuery = rootFilesQuery.eq('is_logo', true);
      }

      const { data: rootFiles, error: rootFilesErr } = await rootFilesQuery;
      if (rootFilesErr) throw rootFilesErr;

      if (!rootFiles || rootFiles.length === 0) {
        showToast('Nincsenek rendszerezetlen képek a gyökérkönyvtárban!');
        return;
      }

      // 2. Prepare existing folder names
      const existingFolderNames = allFolders.map(f => f.name);

      // 3. Call backend endpoint
      const backendUrl = getBackendUrl();
      const sortResp = await fetch(`${backendUrl}/marketing/api/zombo/smart-sort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: rootFiles.map(f => ({ id: f.id, url: f.url })),
          existingFolderNames
        })
      });

      if (!sortResp.ok) {
        throw new Error(await sortResp.text());
      }

      const sortData = await sortResp.json();
      if (!sortData.success) {
        throw new Error(sortData.error || 'Ismeretlen hiba');
      }

      const mappings = sortData.mappings || [];
      if (mappings.length === 0) {
        showToast('Az AI nem tudott kategóriákat rendelni a képekhez.');
        return;
      }

      // 4. Update the DB on client side based on mappings
      let processedCount = 0;
      const localFolderCache: Record<string, string> = {};
      allFolders.forEach(f => {
        localFolderCache[f.name.toLowerCase()] = f.id;
      });

      for (const mapping of mappings) {
        const cat = mapping.category;
        const fileId = mapping.fileId;
        const lowerCat = cat.toLowerCase();
        let folderId = localFolderCache[lowerCat];

        if (!folderId) {
          // Create the folder on the fly
          const { data: newFolder, error: insertErr } = await supabase
            .from('media_folders')
            .insert({
              name: cat,
              brand_id: brandId,
              user_id: user?.id || null,
              is_logo: activeSubTab === 'logos'
            })
            .select()
            .single();

          if (insertErr) {
            console.error('[SMART-SORT] Client side folder insert error:', insertErr);
            continue;
          }

          folderId = newFolder.id;
          localFolderCache[lowerCat] = folderId;
        }

        // Update the file's folder_id
        const { error: updateErr } = await supabase
          .from('media_files')
          .update({ folder_id: folderId })
          .eq('id', fileId);

        if (!updateErr) {
          processedCount++;
        }
      }

      showToast(`Sikeres szortírozás! ${processedCount} kép áthelyezve.`);
      
      // 5. Reload folder tree and contents
      fetchCurrentFolderContents(currentFolderId, activeSubTab);
      fetchAllFolders(activeSubTab);
    } catch (err: any) {
      console.error(err);
      showToast('Hiba az AI szortírozás közben: ' + err.message);
    } finally {
      setIsSorting(false);
    }
  };

  // Folder Tree builders & node renderers
  const buildFolderTree = (items: any[], parentId: string | null = null): any[] => {
    return items
      .filter(item => item.parent_id === parentId)
      .map(item => ({
        ...item,
        children: buildFolderTree(items, item.id)
      }));
  };

  const folderTreeData = buildFolderTree(allFolders, null);

  const renderFolderTreeNode = (node: any, depth = 0) => {
    const isExpanded = !!expandedFolderIds[node.id];
    const isSelected = currentFolderId === node.id;
    const hasChildren = node.children && node.children.length > 0;

    const toggleExpand = (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedFolderIds(prev => ({ ...prev, [node.id]: !prev[node.id] }));
    };

    const handleSelect = () => {
      setCurrentFolderId(node.id);
      
      // Rebuild breadcrumbs path dynamically from selected node up to root
      const path: { id: string | null; name: string }[] = [];
      let curr = node;
      while (curr) {
        path.unshift({ id: curr.id, name: curr.name });
        curr = allFolders.find(f => f.id === curr.parent_id);
      }
      setBreadcrumbs(path);
    };

    return (
      <div key={node.id} style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          onClick={handleSelect}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 8px',
            paddingLeft: 8 + depth * 12,
            borderRadius: 8,
            cursor: 'pointer',
            background: isSelected ? 'rgba(139, 92, 246, 0.12)' : 'transparent',
            border: isSelected ? '1px solid rgba(139, 92, 246, 0.25)' : '1px solid transparent',
            color: isSelected ? '#a78bfa' : 'var(--text-muted)',
            fontSize: 13,
            fontWeight: isSelected ? 700 : 500,
            gap: 6,
            transition: 'all 0.15s',
            position: 'relative'
          }}
          onMouseEnter={e => {
            if (!isSelected) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
              e.currentTarget.style.color = 'var(--text)';
            }
          }}
          onMouseLeave={e => {
            if (!isSelected) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-muted)';
            }
          }}
        >
          {/* Collapse/Expand chevron arrow */}
          <button
            type="button"
            onClick={toggleExpand}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 14,
              height: 14,
              visibility: hasChildren ? 'visible' : 'hidden'
            }}
          >
            <span style={{ fontSize: 9, transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
          </button>

          {/* Folder emoji */}
          <span style={{ fontSize: 13 }}>{isExpanded ? '📂' : '📁'}</span>

          {/* Name text */}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontSize: 12.5 }}>
            {node.name}
          </span>

          {/* Delete & Rename actions */}
          <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => { setRenameFolderId(node.id); setRenameFolderName(node.name); }}
              title="Átnevezés"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 10, padding: 2 }}
            >
              ✏️
            </button>
            <button
              onClick={(e) => handleDeleteFolder(e, node.id, node.name)}
              title="Törlés"
              style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 10, padding: 2 }}
            >
              🗑️
            </button>
          </div>
        </div>

        {/* Nested Child Nodes */}
        {isExpanded && hasChildren && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {node.children.map((child: any) => renderFolderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderRootNode = () => {
    const isSelected = currentFolderId === null;
    return (
      <div
        onClick={() => {
          setCurrentFolderId(null);
          setBreadcrumbs([]);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 10px',
          borderRadius: 8,
          cursor: 'pointer',
          background: isSelected ? 'rgba(139, 92, 246, 0.12)' : 'transparent',
          border: isSelected ? '1px solid rgba(139, 92, 246, 0.25)' : '1px solid transparent',
          color: isSelected ? '#a78bfa' : 'var(--text)',
          fontSize: 13,
          fontWeight: isSelected ? 700 : 600,
          gap: 8,
          marginBottom: 6,
          transition: 'all 0.15s'
        }}
        onMouseEnter={e => {
          if (!isSelected) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
          }
        }}
        onMouseLeave={e => {
          if (!isSelected) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        <span style={{ fontSize: 14 }}>💻</span>
        <span style={{ flex: 1 }}>Főkönyvtár</span>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Sub-tabs for Media vs Logos */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        <button
          type="button"
          onClick={() => { setActiveSubTab('gallery'); setCurrentFolderId(null); setBreadcrumbs([]); }}
          style={{
            padding: '8px 16px',
            background: activeSubTab === 'gallery' ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
            border: activeSubTab === 'gallery' ? '1px solid rgba(139, 92, 246, 0.2)' : '1px solid transparent',
            color: activeSubTab === 'gallery' ? '#a78bfa' : 'var(--text-muted)',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: activeSubTab === 'gallery' ? 700 : 500,
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          📁 Média Galéria
        </button>
        <button
          type="button"
          onClick={() => { setActiveSubTab('logos'); setCurrentFolderId(null); setBreadcrumbs([]); }}
          style={{
            padding: '8px 16px',
            background: activeSubTab === 'logos' ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
            border: activeSubTab === 'logos' ? '1px solid rgba(139, 92, 246, 0.2)' : '1px solid transparent',
            color: activeSubTab === 'logos' ? '#a78bfa' : 'var(--text-muted)',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: activeSubTab === 'logos' ? 700 : 500,
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          ✨ Logók és Ikonok
        </button>
      </div>

      {/* Media Library Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        {/* Breadcrumbs or Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {activeSubTab === 'gallery' ? (
            <>
              <button
                onClick={() => navigateBreadcrumb(-1)}
                style={{ background: 'transparent', border: 'none', color: '#8b5cf6', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
              >
                Média Galéria
              </button>
              {breadcrumbs.map((b, idx) => (
                <React.Fragment key={b.id}>
                  <span style={{ color: 'var(--text-dim)' }}>&gt;</span>
                  <button
                    onClick={() => navigateBreadcrumb(idx)}
                    style={{ background: 'transparent', border: 'none', color: '#8b5cf6', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
                  >
                    {b.name}
                  </button>
                </React.Fragment>
              ))}
            </>
          ) : (
            <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 14 }}>
              Arculati Logók & Ikonok
            </span>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setIsCreateFolderOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.18)',
              borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#a78bfa', cursor: 'pointer'
            }}
          >
            <FolderPlus size={14} /> Új mappa
          </button>

          <button
            type="button"
            onClick={() => setIsSortConfirmOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.18)',
              borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#a78bfa', cursor: 'pointer'
            }}
          >
            ✨ AI Szortírozás
          </button>

          <label
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', borderRadius: 10,
              padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(139,92,246,0.2)'
            }}
          >
            <Upload size={14} /> {uploading ? 'Feltöltés...' : (activeSubTab === 'logos' ? 'Logó feltöltése' : 'Kép feltöltése')}
            <input type="file" accept="image/*" multiple onChange={handleFileUpload} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Two-Column Layout */}
      <div style={{ display: 'flex', gap: 20, minHeight: 400 }}>
        {/* Left Column: Persistent Folder Tree Sidebar */}
        <div style={{
          width: 240,
          flexShrink: 0,
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '65vh',
          overflowY: 'auto'
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.5px' }}>
            Mappa-hierarchia
          </div>
          {renderRootNode()}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {folderTreeData.map(node => renderFolderTreeNode(node, 0))}
          </div>
        </div>

        {/* Right Column: Files & Subfolders grid */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Folders and Files Display Area */}
          {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ width: 18, height: 18, border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
          <span>Fájlok betöltése...</span>
        </div>
      ) : files.length === 0 ? (
        <div style={{ background: 'var(--bg2)', border: '1px dashed var(--border)', borderRadius: 16, padding: '80px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Folder size={40} style={{ opacity: 0.3, marginBottom: 12, margin: '0 auto 12px auto', display: 'block' }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {activeSubTab === 'logos' ? 'Nincsenek arculati logók és ikonok.' : 'Ez a mappa teljesen üres.'}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {activeSubTab === 'logos'
              ? 'Tölts fel egy logót a fenti gomb segítségével, vagy indíts új auditot a gyűjtésükhöz!'
              : 'Tölts fel egy képet a fenti gombok segítségével!'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Files Grid */}
          {files.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 10, letterSpacing: '0.5px' }}>Fájlok ({files.length})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
                {files.map(f => (
                  <div
                    key={f.id}
                    style={{
                      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
                      overflow: 'hidden', transition: 'border-color 0.2s', display: 'flex', flexDirection: 'column'
                    }}
                  >
                    {/* Image Thumbnail */}
                    <div
                      style={{
                        height: 110, position: 'relative',
                        background: '#e2e8f0 repeating-conic-gradient(#ffffff 0% 25%, #cbd5e1 0% 50%) 50% / 10px 10px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-in'
                      }}
                      onClick={() => setPreviewImageUrl(f.url)}
                    >
                      <img src={f.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      
                      {/* Delete overlay */}
                      <button
                        onClick={(e) => handleDeleteFile(e, f.id)}
                        style={{
                          position: 'absolute', top: 6, right: 6,
                          width: 24, height: 24, borderRadius: '50%',
                          background: 'rgba(239, 68, 68, 0.85)', color: '#fff',
                          border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', fontSize: 11
                        }}
                        title="Törlés"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {/* Metadata & Select */}
                    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.name}>
                        {f.name}
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                          {(f.size / 1024).toFixed(0)} KB
                        </span>
                        
                        {isSelectorMode && onSelect ? (
                          <button
                            onClick={() => onSelect(f.url)}
                            style={{
                              background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', border: 'none',
                              color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '4px 10px',
                              cursor: 'pointer'
                            }}
                          >
                            Kiválasztás
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDownloadFile(f.url)}
                            style={{ background: 'transparent', border: 'none', color: '#8b5cf6', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}
                          >
                            Letöltés
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

        </div>
      </div>

      {/* Create Folder Modal */}
      {isCreateFolderOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <form onSubmit={handleCreateFolder} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 340, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Új mappa létrehozása</h3>
            <input
              type="text" required placeholder="Mappa neve..." value={newFolderName} onChange={e => setNewFolderName(e.target.value)} autoFocus
              style={{ width: '100%', padding: 10, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => { setIsCreateFolderOpen(false); setNewFolderName(''); }} style={{ padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Mégse</button>
              <button type="submit" style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Létrehozás</button>
            </div>
          </form>
        </div>
      )}

      {/* Upload AI Smart Sort Prompt Modal */}
      {isUploadConfirmOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              ✨ Képfeltöltés és AI Szortírozás
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Kiválasztottál <b>{pendingUploadFiles.length}</b> képet feltöltésre. Akarod a feltöltött képeket azonnal szortírozni az AI segítségével?
            </p>
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa' }}>Működési szabályok:</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>• <b>Igen, szortírozással:</b> Feltölti a képeket, majd azonnal kategória mappákba helyezi el őket.</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>• <b>Nem, csak feltöltés:</b> Feltölti a képeket szortírozás nélkül a jelenleg megnyitott mappádba.</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>• <b>Becsült AI költség:</b> kb. {Math.round(pendingUploadFiles.length * 1.8)} Ft.</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => { setIsUploadConfirmOpen(false); setPendingUploadFiles([]); }} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Mégse</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => executeUpload(false)} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Nem, csak feltöltés</button>
                <button onClick={() => executeUpload(true)} style={{ padding: '8px 14px', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>Igen, szortírozással</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Sort Confirmation Modal */}
      {isSortConfirmOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              ✨ Csoportos AI Szortírozás
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Az AI automatikusan megvizsgálja a gyökérkönyvtárban lévő összes képet a vizuális tartalmuk alapján, és különálló, tágabb kategóriájú mappákba csoportosítja őket.
            </p>
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa' }}>Működési szabályok:</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>• <b>Vizuális elemzés:</b> Nem fájlnevekből indul ki, hanem a kép tartalmát elemzi.</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>• <b>Szinonima szűrés:</b> Összevonja a hasonló témákat (pl. nem hoz létre külön Szerszám és Munkaeszköz mappát).</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>• <b>Mappa újrahasznosítás:</b> Felhasználja a meglévő mappaneveket, ha azok illenek a képhez.</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>• <b>Feldolgozási költség:</b> kb. 1.8 Ft ($0.005) képenként.</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button type="button" onClick={() => setIsSortConfirmOpen(false)} style={{ padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Mégse</button>
              <button onClick={handleSmartSort} style={{ padding: '8px 18px', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Szortírozás indítása</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Sorting Loader Overlay */}
      {isSorting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5, 3, 12, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9999, gap: 16 }}>
          <div style={{ width: 40, height: 40, border: '4px solid rgba(139,92,246,0.2)', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>AI Szortírozás folyamatban...</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '0 20px', maxWidth: 400 }}>A képek vizuális elemzése és kategóriákba sorolása történik. Ez eltarthat 10-15 másodpercig.</div>
        </div>
      )}

      {/* Rename Folder Modal */}
      {renameFolderId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <form onSubmit={handleRenameFolder} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 340, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Mappa átnevezése</h3>
            <input
              type="text" required placeholder="Új név..." value={renameFolderName} onChange={e => setRenameFolderName(e.target.value)} autoFocus
              style={{ width: '100%', padding: 10, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => { setRenameFolderId(null); setRenameFolderName(''); }} style={{ padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Mégse</button>
              <button type="submit" style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Mentés</button>
            </div>
          </form>
        </div>
      )}

      {/* Image Preview Overlay */}
      {previewImageUrl && (
        <div
          onClick={() => setPreviewImageUrl(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(5, 3, 12, 0.94)', backdropFilter: 'blur(20px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative', maxWidth: '90%', maxHeight: '80%',
              background: '#e2e8f0 repeating-conic-gradient(#ffffff 0% 25%, #cbd5e1 0% 50%) 50% / 15px 15px',
              padding: 10, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            <img src={previewImageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }} />
            
            {/* Top Close button */}
            <button
              onClick={() => setPreviewImageUrl(null)}
              style={{
                position: 'absolute', top: -40, right: 0, background: 'transparent', border: 'none',
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              Bezárás ✕
            </button>
          </div>

          {/* Action buttons under preview */}
          <div style={{ display: 'flex', gap: 16, marginTop: 20 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => handleDownloadFile(previewImageUrl)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', border: 'none',
                borderRadius: 10, padding: '10px 20px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}
            >
              <Download size={14} /> Fájl letöltése
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
