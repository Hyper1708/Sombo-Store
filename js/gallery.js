// Photo slideshow in the product modal: rotates on its own, swipes on phones,
// and can be moved with the arrows, the thumbnails or the keyboard.

const GALLERY_INTERVAL_MS = 3500;
const SWIPE_MIN_PX = 40;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const gallery = { images: [], index: 0, alt: '', timer: null, paused: false };

const galleryEl = document.getElementById('productGallery');
const gallerySlides = document.getElementById('gallerySlides');
const galleryThumbs = document.getElementById('productModalThumbs');
const galleryCounter = document.getElementById('galleryCounter');

const isProductModalOpen = () => document.getElementById('productModal').classList.contains('active');

const showGallery = (images, altText) => {
    gallery.images = images.length ? [...images] : [PLACEHOLDER_IMG];
    gallery.index = 0;
    gallery.alt = altText || '';
    renderGallery();
    startGalleryAutoplay();
};

const renderGallery = () => {
    const { images, index } = gallery;
    const multiple = images.length > 1;

    gallerySlides.innerHTML = images.map((src, i) =>
        `<img class="gallery-slide${i === index ? ' active' : ''}" src="${escapeHtml(src)}" alt="${escapeHtml(gallery.alt)}">`
    ).join('');
    gallerySlides.querySelectorAll('.gallery-slide').forEach(img => {
        img.addEventListener('error', () => dropGalleryImage(img.getAttribute('src')), { once: true });
    });

    galleryEl.classList.toggle('single', !multiple);
    galleryThumbs.style.display = multiple ? 'flex' : 'none';
    galleryThumbs.innerHTML = multiple
        ? images.map((src, i) =>
            `<img class="product-modal-thumb${i === index ? ' active' : ''}" src="${escapeHtml(src)}" data-index="${i}" alt="">`
          ).join('')
        : '';

    updateGalleryCounter();
};

// A photo that fails to load is taken out of the slideshow instead of showing a broken image
const dropGalleryImage = (src) => {
    const i = gallery.images.indexOf(src);
    if (i === -1 || src === PLACEHOLDER_IMG) return;
    gallery.images.splice(i, 1);
    if (gallery.images.length === 0) gallery.images = [PLACEHOLDER_IMG];
    if (i < gallery.index || gallery.index >= gallery.images.length) {
        gallery.index = Math.max(0, gallery.index - 1);
    }
    renderGallery();
    if (gallery.images.length < 2) stopGalleryAutoplay();
};

const goToSlide = (i) => {
    const count = gallery.images.length;
    if (count < 2) return;
    gallery.index = (i + count) % count;
    gallerySlides.querySelectorAll('.gallery-slide').forEach((img, n) => img.classList.toggle('active', n === gallery.index));
    galleryThumbs.querySelectorAll('.product-modal-thumb').forEach((img, n) => img.classList.toggle('active', n === gallery.index));
    keepActiveThumbVisible();
    updateGalleryCounter();
};

const keepActiveThumbVisible = () => {
    const thumb = galleryThumbs.querySelector('.product-modal-thumb.active');
    if (!thumb) return;
    const left = thumb.offsetLeft - galleryThumbs.offsetLeft - (galleryThumbs.clientWidth - thumb.offsetWidth) / 2;
    galleryThumbs.scrollTo({ left, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
};

const updateGalleryCounter = () => {
    galleryCounter.textContent = `${gallery.index + 1} / ${gallery.images.length}`;
};

const startGalleryAutoplay = () => {
    stopGalleryAutoplay();
    // People who ask their device for less motion get a still photo; arrows and swipe still work
    if (gallery.images.length < 2 || reduceMotion.matches) return;
    gallery.timer = setInterval(() => {
        // The Telegram back button closes modals without calling closeProductModal()
        if (!isProductModalOpen()) return stopGalleryAutoplay();
        if (!gallery.paused && !document.hidden) goToSlide(gallery.index + 1);
    }, GALLERY_INTERVAL_MS);
};

const stopGalleryAutoplay = () => {
    clearInterval(gallery.timer);
    gallery.timer = null;
};

// After a manual move, give the customer a full interval before the next automatic one
const navigateGallery = (i) => {
    goToSlide(i);
    startGalleryAutoplay();
};

document.getElementById('galleryPrev').addEventListener('click', () => navigateGallery(gallery.index - 1));
document.getElementById('galleryNext').addEventListener('click', () => navigateGallery(gallery.index + 1));

galleryThumbs.addEventListener('click', (e) => {
    const i = e.target.dataset && e.target.dataset.index;
    if (i !== undefined) navigateGallery(Number(i));
});

// Pause while the mouse is over the photo (mouse only: taps would never "leave")
galleryEl.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') gallery.paused = true; });
galleryEl.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') gallery.paused = false; });

// Swipe left/right on phones; vertical moves still scroll the modal
let swipeStart = null;
galleryEl.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    swipeStart = { x: t.clientX, y: t.clientY };
    gallery.paused = true;
}, { passive: true });
galleryEl.addEventListener('touchend', (e) => {
    gallery.paused = false;
    if (!swipeStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStart.x;
    const dy = t.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
        navigateGallery(gallery.index + (dx < 0 ? 1 : -1));
    }
});
galleryEl.addEventListener('touchcancel', () => { gallery.paused = false; swipeStart = null; });

document.addEventListener('keydown', (e) => {
    if (!isProductModalOpen() || e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') navigateGallery(gallery.index - 1);
    if (e.key === 'ArrowRight') navigateGallery(gallery.index + 1);
});
