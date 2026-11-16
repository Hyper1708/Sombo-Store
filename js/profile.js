// Customer profile: sign-up form, delivery location map and saved details.

let userInfo = JSON.parse(localStorage.getItem('userInfo')) || null;
let signupMap = null;
let userMarker = null;

// User info functions
const openSignupModal = () => {
    // Close cart modal first to avoid overlap
    document.getElementById('cartModal').classList.remove('active');

    const modal = document.getElementById('signupModal');
    modal.style.display = 'flex';
    modal.classList.add('active');
    modal.style.zIndex = '3000';
    setTimeout(() => initSignupMap(), 100);
    tgShowBackButton();

    // Load existing data if any
    if (userInfo) {
        document.getElementById('userName').value = userInfo.name || '';
        document.getElementById('userPhone').value = userInfo.phone || '';
        document.getElementById('userNote').value = userInfo.note || '';
        document.getElementById('userAddress').value = userInfo.address || '';
        document.getElementById('userLat').value = userInfo.lat || '';
        document.getElementById('userLng').value = userInfo.lng || '';
    }
};

const closeSignupModal = () => {
    const modal = document.getElementById('signupModal');
    modal.classList.remove('active');
    modal.style.display = 'none';
    tgHideBackButton();
};

const reverseGeocode = async (lat, lng) => {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        document.getElementById('userAddress').value = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch (error) {
        document.getElementById('userAddress').value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
};

const initSignupMap = () => {
    if (signupMap) {
        signupMap.invalidateSize();
        return;
    }

    // Default to Phnom Penh, Cambodia
    const defaultLat = 11.5564;
    const defaultLng = 104.9282;

    // Use saved location or default to Phnom Penh
    let startLat = defaultLat;
    let startLng = defaultLng;
    let startZoom = 13;

    if (userInfo && userInfo.lat && userInfo.lng) {
        startLat = parseFloat(userInfo.lat);
        startLng = parseFloat(userInfo.lng);
        startZoom = 15;
    }

    signupMap = L.map('signupMap').setView([startLat, startLng], startZoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(signupMap);

    // Set initial coordinates
    document.getElementById('userLat').value = startLat;
    document.getElementById('userLng').value = startLng;

    // Reverse geocode the initial position
    reverseGeocode(startLat, startLng);

    // When map is moved, update location to map center
    signupMap.on('moveend', () => {
        const center = signupMap.getCenter();
        document.getElementById('userLat').value = center.lat;
        document.getElementById('userLng').value = center.lng;
        reverseGeocode(center.lat, center.lng);
    });
};

const saveUserInfo = () => {
    const name = document.getElementById('userName').value.trim();
    const phone = document.getElementById('userPhone').value.trim();
    const note = document.getElementById('userNote').value.trim();
    const address = document.getElementById('userAddress').value.trim();
    const lat = document.getElementById('userLat').value;
    const lng = document.getElementById('userLng').value;
    const t = translations[currentLang];

    // Clear previous errors
    ['nameError','phoneError'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = ''; el.classList.remove('show'); }
    });
    document.getElementById('userName').classList.remove('error');
    document.getElementById('userPhone').classList.remove('error');

    let valid = true;
    if (!name || name.length < 2) {
        const el = document.getElementById('nameError');
        el.textContent = t.alertEnterName || 'Please enter your full name (at least 2 characters).';
        el.classList.add('show');
        document.getElementById('userName').classList.add('error');
        valid = false;
    }
    // Cambodian phone: starts with 0, 9–10 digits, or starts with +855
    const phoneClean = phone.replace(/[\s\-().]/g, '');
    const phoneValid = /^(0[0-9]{8,9}|\+855[0-9]{8,9})$/.test(phoneClean);
    if (!phone || !phoneValid) {
        const el = document.getElementById('phoneError');
        el.textContent = t.alertEnterPhone || 'Please enter a valid Cambodian phone number (e.g. 012 345 678).';
        el.classList.add('show');
        document.getElementById('userPhone').classList.add('error');
        valid = false;
    }
    if (!lat || !lng) {
        showToast(t.alertSelectLocation || '📍 Please drop the pin on your delivery location.');
        valid = false;
    }
    if (!valid) return;

    userInfo = { name, phone: phoneClean, note, address, lat, lng };
    localStorage.setItem('userInfo', JSON.stringify(userInfo));

    loadUserInfo();
    closeSignupModal();
    showToast('✅ ' + (t.alertSaved || 'Profile saved!'));
};

const loadUserInfo = () => {
    userInfo = JSON.parse(localStorage.getItem('userInfo'));
    const t = translations[currentLang];

    // Update user info display when signed up
    if (userInfo) {
        document.getElementById('displayUserName').textContent = userInfo.name;
        document.getElementById('displayUserPhone').textContent = userInfo.phone;
        document.getElementById('userInfoBar').style.display = 'block';
        document.getElementById('profileBtnText').textContent = translations[currentLang].profile;
    } else {
        document.getElementById('userInfoBar').style.display = 'none';
        document.getElementById('profileBtnText').textContent = translations[currentLang].signUp;
    }
};
