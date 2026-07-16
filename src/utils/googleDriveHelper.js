const FOLDER_NAME = 'PMS888 Backups';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const LS_ENABLED = 'pms888_drive_enabled';
const LS_EMAIL = 'pms888_drive_email';
const LS_LAST = 'pms888_drive_last_backup';

export const getDriveStoredEmail = () => localStorage.getItem(LS_EMAIL);
export const getDriveLastBackup = () => localStorage.getItem(LS_LAST);
export const setDriveLastBackup = (iso) => localStorage.setItem(LS_LAST, iso);
export const isDriveEnabled = () => localStorage.getItem(LS_ENABLED) === 'true';

export const saveDriveSession = (email) => {
    localStorage.setItem(LS_ENABLED, 'true');
    localStorage.setItem(LS_EMAIL, email);
};

export const clearDriveSession = () => {
    localStorage.removeItem(LS_ENABLED);
    localStorage.removeItem(LS_EMAIL);
    localStorage.removeItem(LS_LAST);
};

export const loadGisScript = () =>
    new Promise((resolve) => {
        if (window.google?.accounts?.oauth2) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = resolve;
        document.head.appendChild(s);
    });

export const requestToken = (clientId, silent = false) =>
    new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPES,
            callback: (resp) => {
                if (resp.error) reject(new Error(resp.error));
                else resolve(resp.access_token);
            },
            error_callback: (err) => reject(new Error(err?.type || 'oauth_error')),
        });
        client.requestAccessToken({ prompt: silent ? 'none' : 'consent' });
    });

const authFetch = (url, token, opts = {}) =>
    fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...opts.headers } });

const getOrCreateFolder = async (token) => {
    const q = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const res = await authFetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
        token
    ).then(r => r.json());

    if (res.files?.length > 0) return res.files[0].id;

    const folder = await authFetch('https://www.googleapis.com/drive/v3/files', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    }).then(r => r.json());

    return folder.id;
};

export const uploadToDrive = async (token, filename, data) => {
    const folderId = await getOrCreateFolder(token);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const metadata = { name: filename, parents: [folderId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const res = await authFetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
        token,
        { method: 'POST', body: form }
    ).then(r => r.json());

    return res;
};

export const listDriveBackups = async (token) => {
    const folderId = await getOrCreateFolder(token);
    const q = `'${folderId}' in parents and trashed=false`;
    const res = await authFetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime,webViewLink)&orderBy=createdTime+desc&pageSize=30`,
        token
    ).then(r => r.json());
    return res.files || [];
};

export const pruneOldDriveBackups = async (token, keep = 30) => {
    const folderId = await getOrCreateFolder(token);
    const q = `'${folderId}' in parents and trashed=false`;
    const res = await authFetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&orderBy=createdTime+desc&pageSize=100`,
        token
    ).then(r => r.json());
    const toDelete = (res.files || []).slice(keep);
    await Promise.all(toDelete.map(f =>
        authFetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, token, { method: 'DELETE' })
    ));
};

export const needsDailyBackup = () => {
    const last = getDriveLastBackup();
    if (!last) return true;
    const hoursSince = (Date.now() - new Date(last).getTime()) / 3600000;
    return hoursSince >= 24;
};
