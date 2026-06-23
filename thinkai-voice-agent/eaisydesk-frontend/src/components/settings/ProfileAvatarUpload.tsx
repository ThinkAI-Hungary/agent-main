/**
 * ProfileAvatarUpload — standalone component extracted from BeallitasokPage.
 * All state is local; the parent doesn't need to know about upload state.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '../../api/client';
import { showToast } from '../ui/Toast';

interface Props {
  initials: string;
  username: string;
}

export default function ProfileAvatarUpload({ initials, username }: Props) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    authFetch(`/admin/api/users/${username}/avatar`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.avatar_url) setAvatarUrl(d.avatar_url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [username]);

  const resizeAndUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Csak képfájl tölthető fel!', 'error');
      return;
    }
    if (file.size > 5_000_000) {
      showToast('A kép túl nagy (max 5MB)!', 'error');
      return;
    }

    setUploading(true);
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Képbetöltési hiba'));
        img.src = objectUrl;
      });

      const canvas = document.createElement('canvas');
      const size = 200;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
      URL.revokeObjectURL(objectUrl);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      const res = await authFetch('/admin/api/users/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_data: dataUrl }),
      });

      if (res.ok) {
        const data = await res.json();
        setAvatarUrl(data.avatar_url);
        showToast('Profilkép feltöltve!');
        window.dispatchEvent(new Event('avatar-changed'));
      } else {
        const err = await res.json().catch(() => ({ detail: 'Ismeretlen hiba' }));
        showToast(err.detail || 'Feltöltési hiba', 'error');
      }
    } catch {
      showToast('Képfeldolgozási hiba', 'error');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDelete = useCallback(async () => {
    try {
      const res = await authFetch('/admin/api/users/avatar', { method: 'DELETE' });
      if (res.ok) {
        setAvatarUrl(null);
        showToast('Profilkép eltávolítva');
        window.dispatchEvent(new Event('avatar-changed'));
      }
    } catch {
      showToast('Hiba', 'error');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) resizeAndUpload(file);
  }, [resizeAndUpload]);

  return (
    <div className="avatar-wrapper">
      <div
        className={`avatar-ring ${dragOver ? 'avatar-ring--drag' : ''}`}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="avatar-inner">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="avatar-img" />
          ) : (
            <span className="avatar-initials">{initials}</span>
          )}
        </div>

        <div className="avatar-overlay" style={{ opacity: hovering || dragOver ? 1 : 0 }}>
          {uploading ? (
            <div className="spinner avatar-spinner" />
          ) : (
            <>
              <svg fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24" className="avatar-overlay-svg">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span className="avatar-overlay-label">
                {dragOver ? 'Ejtsd ide' : 'Módosítás'}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1">
        <div className="avatar-info-title">Profilkép</div>
        <div className="avatar-info-desc">
          Kattints az avatárra vagy húzd rá a képet.<br />JPG, PNG — max 5MB
        </div>
        <div className="flex-row gap-8">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="avatar-upload-btn"
          >
            {uploading ? 'Feltöltés...' : 'Kép kiválasztása'}
          </button>
          {avatarUrl && (
            <button onClick={handleDelete} className="avatar-delete-btn">
              Eltávolítás
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="avatar-file-input"
        onChange={e => { const f = e.target.files?.[0]; if (f) resizeAndUpload(f); e.target.value = ''; }}
      />
    </div>
  );
}
