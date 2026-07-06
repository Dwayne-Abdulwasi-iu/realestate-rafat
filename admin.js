const ADMIN_EMAIL = 'realestate@gmail.com';
const ADMIN_PASSWORD = 'realestate';
const DEFAULT_API_BASE = 'http://127.0.0.1:3000';
const API_BASE = window.location.origin && window.location.origin.includes('3000') ? window.location.origin : DEFAULT_API_BASE;

let propertiesCache = [];
let selectedPropertyId = '';
let pendingMediaFiles = [];
let existingMediaPreview = [];

const adminLoginCard = document.getElementById('admin-login-card');
const adminDashboard = document.getElementById('admin-dashboard');
const adminLoginForm = document.getElementById('admin-login-form');
const logoutBtn = document.getElementById('logout-btn');
const propertyForm = document.getElementById('property-form');
const formTitle = document.getElementById('form-title');
const adminProperties = document.getElementById('admin-properties');
const mediaInput = document.getElementById('property-media');
const mediaPreview = document.getElementById('media-preview');
const addMediaBtn = document.getElementById('add-media-btn');
const toastContainer = document.getElementById('toast-container');
const toggleMediaBtn = document.getElementById('toggle-media-panel');
const showAllMediaBtn = document.getElementById('show-all-media');

function showToast(message, type = 'info', duration = 4000) {
  if (!toastContainer) {
    alert(message);
    return;
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type === 'error') toast.style.background = '#8b1e1e';
  if (type === 'success') toast.style.background = '#1b8f5a';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    if (toastContainer.contains(toast)) toastContainer.removeChild(toast);
  }, duration);
}

function showConfirm(message = 'Are you sure?') {
  return new Promise((resolve) => {
    const previousActive = document.activeElement;
    // overlay and modal
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'confirm-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.tabIndex = -1;

    const msg = document.createElement('div');
    msg.className = 'confirm-message';
    msg.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    const yes = document.createElement('button');
    yes.className = 'btn btn-primary';
    yes.textContent = 'Yes';
    const no = document.createElement('button');
    no.className = 'btn btn-secondary';
    no.textContent = 'Cancel';
    actions.appendChild(yes);
    actions.appendChild(no);

    modal.appendChild(msg);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // focus management
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusable = modal.querySelectorAll(focusableSelector);
    const firstFocusable = focusable[0];
    const lastFocusable = focusable[focusable.length - 1];
    (firstFocusable || modal).focus();

    function cleanup(result) {
      document.removeEventListener('keydown', onKeyDown);
      try { document.body.removeChild(overlay); } catch (e) {}
      if (previousActive && previousActive.focus) previousActive.focus();
      resolve(result);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(false);
        return;
      }
      if (e.key === 'Tab') {
        const nodes = modal.querySelectorAll(focusableSelector);
        if (!nodes.length) { e.preventDefault(); return; }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault(); last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault(); first.focus();
          }
        }
      }
    }

    yes.addEventListener('click', () => cleanup(true));
    no.addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
    document.addEventListener('keydown', onKeyDown);
  });
}


function renderPendingMediaPreview() {
  if (!mediaPreview) return;
  const header = createElement('div', { className: 'media-preview-header' });
  const count = pendingMediaFiles.length;
  mediaPreview.innerHTML = '';
  if (existingMediaPreview.length) {
    const existingHeading = createElement('div', { className: 'media-preview-header' }, 'Existing media');
    mediaPreview.appendChild(existingHeading);
    existingMediaPreview.forEach((media) => {
      const wrap = createElement('div', { className: 'media-item' });
      if (media.type === 'video') {
        const vid = createElement('video', { controls: 'true', src: media.url });
        vid.style.maxWidth = '180px';
        vid.addEventListener('click', (e) => { e.stopPropagation(); openLightboxFor(media.url, 'video'); });
        wrap.appendChild(vid);
      } else {
        const img = createElement('img', { src: media.url, alt: 'media' });
        img.style.maxWidth = '180px';
        img.addEventListener('click', () => openLightboxFor(media.url, 'image'));
        wrap.appendChild(img);
      }
      if (selectedPropertyId) {
        const removeExisting = createElement('button', { className: 'btn remove-btn' }, 'Remove');
        removeExisting.style.marginTop = '8px';
        removeExisting.addEventListener('click', async (event) => {
          event.preventDefault();
          await handleMediaDelete(selectedPropertyId, media.url);
        });
        wrap.appendChild(removeExisting);
      }
      mediaPreview.appendChild(wrap);
    });
  }
  if (count) {
    header.textContent = `${count} pending file${count > 1 ? 's' : ''} selected`;
    mediaPreview.appendChild(header);
    pendingMediaFiles.forEach((file) => {
      const wrap = createElement('div', { className: 'media-item' });
      if (file.type.startsWith('video')) {
        const vid = document.createElement('video');
        vid.controls = true;
        const src = URL.createObjectURL(file);
        vid.src = src;
        vid.style.maxWidth = '240px';
        vid.addEventListener('click', (e) => { e.stopPropagation(); openLightboxFor(src, 'video'); });
        wrap.appendChild(vid);
      } else {
        const img = document.createElement('img');
        const src = URL.createObjectURL(file);
        img.src = src;
        img.alt = file.name;
        img.style.maxWidth = '160px';
        img.style.borderRadius = '8px';
        img.addEventListener('click', () => openLightboxFor(src, 'image'));
        wrap.appendChild(img);
      }
      const removePending = createElement('button', { className: 'btn remove-btn' }, 'Remove');
      removePending.style.marginTop = '8px';
      removePending.addEventListener('click', (event) => {
        event.preventDefault();
        const idx = pendingMediaFiles.indexOf(file);
        if (idx >= 0) {
          pendingMediaFiles.splice(idx, 1);
          renderPendingMediaPreview();
        }
      });
      wrap.appendChild(removePending);
      mediaPreview.appendChild(wrap);
    });
  }
}

function addPendingMediaFiles(files) {
  files.forEach((file) => {
    const duplicate = pendingMediaFiles.some((existing) => existing.name === file.name && existing.size === file.size && existing.type === file.type);
    if (!duplicate) pendingMediaFiles.push(file);
  });
}

// Preview selected media files (supports multiple files without replacing existing selection)
if (mediaInput) {
  mediaInput.addEventListener('change', async () => {
    const files = Array.from(mediaInput.files || []);
    if (!files.length) return;
    addPendingMediaFiles(files);
    renderPendingMediaPreview();
    mediaInput.value = '';
  });
}

if (addMediaBtn && mediaInput) {
  addMediaBtn.addEventListener('click', (e) => {
    e.preventDefault();
    mediaInput.click();
  });
}

// Collapse panel by default; wire toggle and show-all
if (toggleMediaBtn) {
  toggleMediaBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!mediaPreview) return;
    const collapsed = mediaPreview.classList.toggle('collapsed');
    if (!collapsed) {
      mediaPreview.classList.add('expanded');
      mediaPreview.setAttribute('aria-hidden', 'false');
      toggleMediaBtn.textContent = 'Hide media';
    } else {
      mediaPreview.classList.remove('expanded');
      mediaPreview.setAttribute('aria-hidden', 'true');
      toggleMediaBtn.textContent = 'Show media';
    }
  });
}
if (showAllMediaBtn) {
  showAllMediaBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!mediaPreview) return;
    mediaPreview.classList.remove('collapsed');
    mediaPreview.classList.add('expanded');
    mediaPreview.setAttribute('aria-hidden', 'false');
    if (toggleMediaBtn) toggleMediaBtn.textContent = 'Hide media';
  });
}

// Lightbox utilities
function openLightboxFor(src, type = 'image') {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.tabIndex = -1;
  const inner = document.createElement('div');
  inner.className = 'lightbox-inner';
  if (type === 'video') {
    const v = document.createElement('video');
    v.src = src;
    v.controls = true;
    v.autoplay = true;
    inner.appendChild(v);
  } else {
    const img = document.createElement('img');
    img.src = src;
    inner.appendChild(img);
  }
  const close = document.createElement('button');
  close.className = 'lightbox-close';
  close.textContent = 'Close';
  close.addEventListener('click', () => { try { document.body.removeChild(overlay); } catch (e) {} });
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) { try { document.body.removeChild(overlay); } catch (e) {} } });
  overlay.appendChild(inner);
  overlay.appendChild(close);
  document.body.appendChild(overlay);
  overlay.focus();
}

function createElement(tag, attrs = {}, text = '') {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else el.setAttribute(key, value);
  });
  if (text) el.textContent = text;
  return el;
}

function showAdminState(loggedIn) {
  if (loggedIn) {
    adminLoginCard.classList.add('hidden');
    adminDashboard.classList.remove('hidden');
    fetchProperties();
  } else {
    adminLoginCard.classList.remove('hidden');
    adminDashboard.classList.add('hidden');
    resetPropertyForm();
  }
}

async function fetchProperties() {
  try {
    const res = await fetch(`${API_BASE}/api/properties`, { credentials: 'include' });
    propertiesCache = await res.json();
    renderAdminProperties();
  } catch (err) {
    console.error('Failed to fetch properties', err);
  }
}

function renderAdminProperties() {
  adminProperties.innerHTML = '';
  if (!propertiesCache.length) {
    adminProperties.innerHTML = '<p>No properties found.</p>';
    return;
  }

  propertiesCache.forEach((property) => {
    const item = createElement('div', { className: 'admin-item' });
    const header = createElement('div');
    header.innerHTML = `<strong>${property.title}</strong><p>${property.type} • ${property.status}</p><p>${property.location}</p>`;

    const actions = createElement('div', { className: 'admin-item-actions' });
    const editBtn = createElement('button', { className: 'btn btn-primary', dataset: { action: 'edit', id: property.id } }, 'Edit');
    const deleteBtn = createElement('button', { className: 'btn btn-danger', dataset: { action: 'delete', id: property.id } }, 'Delete');
    // ensure visible red styling even if CSS is overridden in some contexts
    deleteBtn.style.marginLeft = '8px';
    deleteBtn.style.background = '#e53935';
    deleteBtn.style.color = '#fff';
    deleteBtn.style.border = 'none';
    deleteBtn.style.boxShadow = '0 6px 18px rgba(229,57,53,0.18)';
    actions.append(editBtn, deleteBtn);

    const mediaList = createElement('div', { className: 'media-gallery collapsed' });
    (property.media || []).forEach((media) => {
      const mediaWrap = createElement('div', { className: 'media-item' });
      const mediaEl = media.type === 'video' ? createElement('video', { controls: 'true', src: media.url }) : createElement('img', { src: media.url, alt: 'media' });
      mediaEl.style.maxWidth = '180px';
      // open lightbox when clicking thumbnails
      try {
        if (media.type === 'video') mediaEl.addEventListener('click', (e) => { e.stopPropagation(); openLightboxFor(media.url, 'video'); });
        else mediaEl.addEventListener('click', () => openLightboxFor(media.url, 'image'));
      } catch (e) {}
      mediaWrap.appendChild(mediaEl);
      const removeMedia = createElement('button', { className: 'btn btn-secondary', dataset: { action: 'delete-media', id: property.id, mediaUrl: media.url } }, 'Delete media');
      removeMedia.style.marginTop = '8px';
      mediaWrap.appendChild(removeMedia);
      mediaList.appendChild(mediaWrap);
    });

    const hasMedia = (property.media || []).length > 0;
    let toggleMediaButton = null;
    if (hasMedia) {
      toggleMediaButton = createElement('button', { className: 'btn btn-secondary media-toggle', type: 'button', dataset: { expanded: 'false' } }, 'Show media');
      toggleMediaButton.addEventListener('click', () => {
        const expanded = !mediaList.classList.toggle('collapsed');
        if (expanded) {
          toggleMediaButton.textContent = 'Hide media';
          toggleMediaButton.dataset.expanded = 'true';
        } else {
          toggleMediaButton.textContent = 'Show media';
          toggleMediaButton.dataset.expanded = 'false';
        }
      });
    }

    const appendChildren = [header, actions];
    if (toggleMediaButton) appendChildren.push(toggleMediaButton);
    appendChildren.push(mediaList);
    item.append(...appendChildren);
    adminProperties.appendChild(item);
  });
}

function resetPropertyForm() {
  propertyForm.reset();
  selectedPropertyId = '';
  pendingMediaFiles = [];
  existingMediaPreview = [];
  formTitle.textContent = 'Add a new property';
  if (mediaPreview) mediaPreview.innerHTML = '';
  if (mediaInput) mediaInput.value = '';
}

function renderEditForm(property) {
  selectedPropertyId = property.id;
  pendingMediaFiles = [];
  existingMediaPreview = property.media || [];
  document.getElementById('property-id').value = property.id;
  document.getElementById('property-title').value = property.title;
  document.getElementById('property-type').value = property.type;
  document.getElementById('property-status').value = property.status;
  document.getElementById('property-description').value = property.description;
  document.getElementById('property-location').value = property.location;
  document.getElementById('property-price').value = property.price;
  document.getElementById('property-bedrooms').value = property.bedrooms;
  document.getElementById('property-bathrooms').value = property.bathrooms;
  document.getElementById('property-size').value = property.size;
  document.getElementById('property-contact').value = property.contact;
  formTitle.textContent = 'Edit property';
  renderPendingMediaPreview();
}

async function handleMediaDelete(propertyId, mediaUrl) {
  if (!(await showConfirm('Remove this media?'))) return;
  try {
    const res = await fetch(`${API_BASE}/api/properties/${propertyId}/media`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mediaUrl })
    });
    const data = await res.json();
    if (res.ok) {
      showUndoToast(data.trashId, propertyId);
      await fetchProperties();
    } else {
      showToast(data.error || 'Failed to delete media', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to delete media', 'error');
  }
}

function showUndoToast(trashId, propertyId) {
  if (!toastContainer) return;
  const toast = createElement('div', { className: 'toast' });
  toast.textContent = 'Media removed.';
  const undoBtn = createElement('button', {}, 'Undo');
  toast.appendChild(undoBtn);
  toastContainer.appendChild(toast);
  let cleared = false;
  const timer = setTimeout(() => {
    if (!cleared && toastContainer.contains(toast)) toastContainer.removeChild(toast);
  }, 10000);
  undoBtn.addEventListener('click', async () => {
    try {
      const res = await fetch(`${API_BASE}/api/properties/${propertyId}/media/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ trashId })
      });
      if (res.ok) {
        cleared = true;
        clearTimeout(timer);
        if (toastContainer.contains(toast)) toastContainer.removeChild(toast);
        await fetchProperties();
      } else {
        showToast('Restore failed', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Restore failed', 'error');
    }
  });
}

adminLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;
  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      showAdminState(true);
      showToast('Signed in successfully.', 'success');
    } else {
      showToast('Invalid admin credentials', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Login failed', 'error');
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include' });
    showAdminState(false);
  } catch (err) {
    console.error(err);
  }
});

propertyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData();
  formData.append('title', document.getElementById('property-title').value.trim());
  formData.append('type', document.getElementById('property-type').value);
  formData.append('status', document.getElementById('property-status').value);
  formData.append('description', document.getElementById('property-description').value.trim());
  formData.append('location', document.getElementById('property-location').value.trim());
  formData.append('price', document.getElementById('property-price').value || 0);
  formData.append('bedrooms', document.getElementById('property-bedrooms').value || 0);
  formData.append('bathrooms', document.getElementById('property-bathrooms').value || 0);
  formData.append('size', document.getElementById('property-size').value || 0);
  formData.append('contact', document.getElementById('property-contact').value.trim());
  if (pendingMediaFiles.length) {
    pendingMediaFiles.forEach((file) => formData.append('media', file));
  }
  try {
    const url = selectedPropertyId ? `${API_BASE}/api/properties/${selectedPropertyId}` : `${API_BASE}/api/properties`;
    const method = selectedPropertyId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, body: formData, credentials: 'include' });
    if (!res.ok) throw new Error('Save failed');
    await fetchProperties();
    resetPropertyForm();
    showToast(selectedPropertyId ? 'Property updated.' : 'Property created.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Save failed. Make sure you are logged in.', 'error');
  }
});

adminProperties.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.action;
  const propertyId = button.dataset.id;
  if (action === 'delete') {
    if (!(await showConfirm('Delete this listing?'))) return;
    try {
      const res = await fetch(`${API_BASE}/api/properties/${propertyId}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        await fetchProperties();
        showToast('Listing deleted.', 'success');
      } else {
        showToast('Delete failed', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  }
  if (action === 'edit') {
    const property = propertiesCache.find((item) => item.id === propertyId);
    if (property) renderEditForm(property);
  }
  if (action === 'delete-media') {
    const mediaUrl = button.dataset.mediaUrl;
    await handleMediaDelete(propertyId, mediaUrl);
  }
});

function initializeAdminPage() {
  showAdminState(false);
}

initializeAdminPage();
