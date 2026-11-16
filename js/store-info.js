// Store info modal with the shop location map.

let storeInfoMap = null;

const openStoreInfoModal = () => {
    document.getElementById('storeInfoModal').classList.add('active');
    setTimeout(() => initStoreInfoMap(), 150);
    tgShowBackButton();
};

const closeStoreInfoModal = () => {
    document.getElementById('storeInfoModal').classList.remove('active');
    tgHideBackButton();
};

const initStoreInfoMap = () => {
    if (storeInfoMap) {
        storeInfoMap.invalidateSize();
        return;
    }

    // Store location
    const storeLat = 11.561746880779763;
    const storeLng = 104.91663826980222;

    storeInfoMap = L.map('storeInfoMap').setView([storeLat, storeLng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(storeInfoMap);

    L.marker([storeLat, storeLng])
        .addTo(storeInfoMap)
        .bindPopup('<b>Sambo Store</b><br>Phnom Penh, Cambodia')
        .openPopup();
};
