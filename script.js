const DEFAULT_API_BASE = 'http://127.0.0.1:3000';
// If the page is already served from the API server (port 3000), use that origin.
const API_BASE = (window.location && window.location.origin && window.location.origin.includes('3000')) ? window.location.origin : DEFAULT_API_BASE;

let propertiesCache = []; // current page results
let searchTimeout = null;
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const priceMinInput = document.getElementById('price-min');
const priceMaxInput = document.getElementById('price-max');
const paginationContainer = document.getElementById('pagination-controls');
let currentPage = 1;
let totalPages = 1;
const PAGE_SIZE = 6;

function normalize(text) {
  return String(text || '').toLowerCase();
}

function applySearch(query) {
  if (!query) return propertiesCache.slice();
  const q = normalize(query);
  return propertiesCache.filter((p) => {
    if (normalize(p.title).includes(q)) return true;
    if (normalize(p.location).includes(q)) return true;
    if (normalize(p.type).includes(q)) return true;
    if (normalize(p.status).includes(q)) return true;
    if (normalize(p.description).includes(q)) return true;
    if (normalize(p.contact).includes(q)) return true;
    // search media names / urls
    if (Array.isArray(p.media)) {
      for (const m of p.media) {
        if (normalize(m.name).includes(q)) return true;
        if (normalize(m.url).includes(q)) return true;
      }
    }
    return false;
  });
}

function applyFilters(list) {
  const min = Number(priceMinInput?.value || 0) || 0;
  const maxRaw = priceMaxInput?.value;
  const max = (typeof maxRaw !== 'undefined' && maxRaw !== null && maxRaw !== '') ? Number(maxRaw) : null;
  if ((!min || min <= 0) && (max === null)) return list;
  return list.filter(p => {
    const price = Number(p.price || 0);
    if (max === null) return price >= min;
    return price >= min && price <= max;
  });
}

const propertyList = document.getElementById('property-list');
const reviewList = document.getElementById('review-list');
const reviewForm = document.getElementById('review-form');

const toastContainer = document.getElementById('toast-container');

function showToast(message, type = 'info', duration = 4000) {
  if (!toastContainer) {
    // fallback to alert if no container
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

function renderProperties(properties) {
  if (!propertyList) return;
  propertyList.innerHTML = '';

  if (!properties.length) {
    propertyList.innerHTML = '<p class="card">No properties available yet.</p>';
    return;
  }

  properties.forEach((property) => {
    const card = createElement('article', { className: 'property-card' });
    const mediaGallery = createElement('div', { className: 'media-gallery collapsed' });
    (property.media || []).forEach((m) => {
      const mediaWrap = createElement('div', { className: 'media-item' });
      if (m.type === 'video') {
        const video = createElement('video', { controls: 'true', src: m.url });
        try { video.addEventListener('click', (e) => { e.stopPropagation(); openLightboxFor(m.url, 'video'); }); } catch (e) {}
        mediaWrap.appendChild(video);
      } else {
        const img = createElement('img', { src: m.url, alt: 'Media' });
        try { img.addEventListener('click', () => openLightboxFor(m.url, 'image')); } catch (e) {}
        mediaWrap.appendChild(img);
      }
      mediaGallery.appendChild(mediaWrap);
    });

    const hasMedia = (property.media || []).length > 0;
    const mediaToggle = hasMedia ? createElement('button', { className: 'btn btn-secondary media-toggle', type: 'button', dataset: { expanded: 'false' } }, 'Show media') : null;
    if (mediaToggle) {
      mediaToggle.addEventListener('click', () => {
        const expanded = !mediaGallery.classList.toggle('collapsed');
        if (expanded) {
          mediaToggle.textContent = 'Hide media';
          mediaToggle.dataset.expanded = 'true';
        } else {
          mediaToggle.textContent = 'Show media';
          mediaToggle.dataset.expanded = 'false';
        }
      });
    }

    card.innerHTML = `
      <span class="badge">${property.type}</span>
      <span class="badge">${property.status}</span>
      <h3>${property.title}</h3>
      <p class="property-meta">${property.location}</p>
      <p>${property.description}</p>
      <p class="price">₦${property.price.toLocaleString()}</p>
      <p class="property-meta">Bedrooms: ${property.bedrooms} • Bathrooms: ${property.bathrooms} • Size: ${property.size} sq ft</p>
      <p class="property-meta">${property.contact}</p>
    `;
    if (mediaToggle) card.appendChild(mediaToggle);
    card.appendChild(mediaGallery);
    propertyList.appendChild(card);
  });
}

async function fetchProperties() {
  try {
    const url = new URL(API_BASE + '/api/properties/search');
    const q = (searchInput?.value || '').trim();
    const min = (priceMinInput?.value || '').trim();
    const max = (priceMaxInput?.value || '').trim();

    if (q) url.searchParams.set('q', q);
    if (min) url.searchParams.set('min', min);
    if (max) url.searchParams.set('max', max);
    url.searchParams.set('page', String(currentPage));
    url.searchParams.set('limit', String(PAGE_SIZE));

    const response = await fetch(url.toString());
    const data = await response.json();
    propertiesCache = data.results || [];
    totalPages = data.totalPages || 1;

    renderProperties(propertiesCache.slice());
    renderPagination();
  } catch (error) {
    console.error('Failed to load properties', error);
    showToast('Unable to load properties. Please try again.', 'error');
  }
}

function renderPagination() {
  if (!paginationContainer) return;
  paginationContainer.innerHTML = '';
  if (totalPages <= 1) return;

  const info = createElement('div', { className: 'pagination-info' }, `Page ${currentPage} of ${totalPages}`);
  const prev = createElement('button', { className: 'btn btn-secondary', type: 'button' }, 'Previous');
  const next = createElement('button', { className: 'btn btn-secondary', type: 'button' }, 'Next');

  prev.disabled = currentPage <= 1;
  next.disabled = currentPage >= totalPages;

  prev.addEventListener('click', () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    fetchProperties();
  });

  next.addEventListener('click', () => {
    if (currentPage >= totalPages) return;
    currentPage += 1;
    fetchProperties();
  });

  paginationContainer.appendChild(prev);
  paginationContainer.appendChild(info);
  paginationContainer.appendChild(next);
}

function resetListingSearch() {
  currentPage = 1;
  fetchProperties();
}

function renderReviews(reviews) {
  if (!reviewList) return;
  reviewList.innerHTML = '';
  if (!reviews.length) {
    reviewList.innerHTML = '<p>No reviews yet. Be the first to share your experience.</p>';
    return;
  }
  reviews.forEach((review) => {
    const item = createElement('div', { className: 'review-item' });
    item.innerHTML = `
      <strong>${review.name}</strong>
      <p>${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</p>
      <p>${review.comment}</p>
    `;
    reviewList.appendChild(item);
  });
}

async function fetchReviews() {
  try {
    const response = await fetch(`${API_BASE}/api/reviews`);
    const reviews = await response.json();
    renderReviews(reviews);
  } catch (error) {
    console.error('Failed to load reviews', error);
  }
}

async function submitReview(event) {
  event.preventDefault();
  const name = document.getElementById('review-name')?.value.trim();
  const email = document.getElementById('review-email')?.value.trim();
  const rating = Number(document.getElementById('review-rating')?.value || 5);
  const comment = document.getElementById('review-comment')?.value.trim();

  if (!name || !email || !comment) {
    showToast('Please fill all review fields.', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, rating, comment })
    });
    if (!response.ok) throw new Error('Review submission failed');
    document.getElementById('review-form').reset();
    fetchReviews();
    showToast('Thank you for your review.', 'success');
  } catch (error) {
    console.error(error);
    showToast('Could not submit review.', 'error');
  }
}

if (propertyList) fetchProperties();
if (reviewForm) reviewForm.addEventListener('submit', submitReview);
if (reviewList) fetchReviews();

// Lightbox utilities for public listing view
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

// wire up search input with debounce
if (searchInput) {
  searchInput.addEventListener('input', () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(resetListingSearch, 260);
  });
}
// price inputs should trigger filtering too
if (priceMinInput) {
  priceMinInput.addEventListener('input', () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(resetListingSearch, 260);
  });
}
if (priceMaxInput) {
  priceMaxInput.addEventListener('input', () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(resetListingSearch, 260);
  });
}
if (clearSearchBtn) {
  clearSearchBtn.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (priceMinInput) priceMinInput.value = '';
    if (priceMaxInput) priceMaxInput.value = '';
    resetListingSearch();
  });
}

function activate3DButtons() {
  const buttons = document.querySelectorAll('.btn-3d, .nav-links a');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      button.classList.add('btn-clicked');
      window.setTimeout(() => button.classList.remove('btn-clicked'), 180);
    });
  });
}

activate3DButtons();
