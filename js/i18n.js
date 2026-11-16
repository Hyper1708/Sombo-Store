// English / Khmer text and the language switch.

let currentLang = localStorage.getItem('lang') || 'en';

const translations = {
    en: {
        // Header & Navigation
        signUp: 'Sign Up',
        profile: '👤 Profile',
        cart: 'Cart',
        welcome: 'Welcome',
        edit: 'Edit',
        all: 'All',
        blanket: 'Blanket',
        tablecloth: 'Tablecloth',
        pillowSheet: 'Pillow Sheet',

        // Products
        inStock: 'In Stock',
        outOfStock: 'Out of Stock',
        addToCart: 'Add to Cart',
        cancel: 'Cancel',
        itemNoteLabel: 'Note for us (optional)',
        itemNotePlaceholder: 'e.g. colors, sizes, packing',
        itemNotFound: 'Sorry, this item is no longer available',

        // Sign Up Modal
        yourInfo: '📝 Your Information',
        fillDetails: 'Please fill in your details to place an order',
        yourName: 'Your Name *',
        phoneNumber: 'Phone Number *',
        additionalInfo: 'Additional Information',
        mapInstruction: '📍 Drag the map to move the pin to your delivery location:',
        selectedLocation: 'Selected Location',
        saveInfo: 'Save Information',

        // Placeholders
        enterName: 'Enter your full name',
        enterPhone: 'Enter your phone number',
        enterNote: 'Any special instructions or notes',
        tapMap: 'Tap on map to select location',

        // Cart Modal
        yourCart: '🛒 Your Cart',
        emptyCart: 'Your cart is empty',
        subtotal: 'Subtotal',
        total: 'Total',
        placeOrder: '📦 Place Order',
        clearCart: 'Clear Cart',
        items: 'items',
        each: 'each',
        print: 'Print',
        download: 'Download',

        // Success Modal
        orderSuccess: 'Order Placed Successfully!',
        orderSuccessMsg: 'Your order has been sent to our team. We will contact you shortly for delivery.',
        continueShopping: 'Continue Shopping',

        // Payment
        paymentTitle: 'ABA PayWay Payment',
        paymentSubtitle: 'Scan QR or tap Pay Now to complete payment',
        payStep1: 'Scan the QR code with your banking app',
        payStep2: 'Or tap "Pay Now" to open ABA app',
        payStep3: 'Complete the payment',
        payStep4: 'Payment will be verified automatically',
        cancelPayment: 'Cancel',
        payNow: '\ud83d\udcb3 Pay Now',
        creatingPayment: 'Creating secure payment...',
        waitingPayment: 'Waiting for payment...',
        paymentVerified: '\u2705 Payment verified!',
        paymentFailed: '\u274c Payment failed',
        paymentTimeout: '\u23f0 Payment timed out',
        paymentPending: '\u23f3 PENDING PAYMENT',
        paymentConfirmed: '\u2705 PAYMENT CONFIRMED',
        receiptIntro: 'Thank you for your order!',
        receiptItems: 'Order Items',
        receiptTotal: 'Total',
        receiptNote: 'We will deliver your order soon. Thank you for shopping with Sambo Store!',

        // Loading
        sendingOrder: 'Sending order...',

        // Store Info
        storeTagline: 'Your one-stop shop for quality home textiles',
        storePhone: 'Phone',
        storeHours: 'Opening Hours',
        storeHoursValue: 'Mon - Sun: 8:00 AM - 8:00 PM',
        storeAddress: 'Address',
        storeAddressValue: 'Phnom Penh, Cambodia',

        // Alerts
        alertFillAll: 'Please fill in all fields',
        alertEnterName: 'Please enter your name',
        alertEnterPhone: 'Please enter your phone number',
        alertSelectLocation: 'Please tap on the map to select your location',
        alertSaved: 'Information saved successfully!',
        alertSignUp: 'Please sign up first before placing an order',
        alertEmptyCart: 'Your cart is empty',
        alertClearCart: 'Clear all items from cart?',
        alertOrderFailed: 'Failed to place order. Please try again or contact us directly.'
    },
    kh: {
        // Header & Navigation
        signUp: 'ចុះឈ្មោះ',
        profile: '👤 គណនី',
        cart: 'កន្ត្រក',
        welcome: 'សូមស្វាគមន៍',
        edit: 'កែប្រែ',
        all: 'ទាំងអស់',
        blanket: 'ភួយ',
        tablecloth: 'ក្រណាត់បូក',
        pillowSheet: 'ស្រោមខ្នើយ',

        // Products
        inStock: 'មានស្តុក',
        outOfStock: 'អស់ស្តុក',
        addToCart: 'ដាក់ក្នុងកន្ត្រក',
        cancel: 'បោះបង់',
        itemNoteLabel: 'កំណត់ចំណាំសម្រាប់ក្រុមការងារ',
        itemNotePlaceholder: 'ឧ. ពណ៌ ទំហំ ការវេចខ្ចប់',
        itemNotFound: 'សូមអភ័យទោស ទំនិញនេះលែងមានហើយ',

        // Sign Up Modal
        yourInfo: '📝 ព័ត៌មានរបស់អ្នក',
        fillDetails: 'សូមបំពេញព័ត៌មានរបស់អ្នក ដើម្បីបញ្ជាទិញ',
        yourName: 'ឈ្មោះរបស់អ្នក *',
        phoneNumber: 'លេខទូរស័ព្ទ *',
        additionalInfo: 'ព័ត៌មានបន្ថែម',
        mapInstruction: '📍​ អូសផែនទីដើម្បីកំណត់ទីតាំងដឹកជញ្ជូនរបស់អ្នក៖',
        selectedLocation: 'ទីតាំងដែលបានជ្រើសរើស',
        saveInfo: 'រក្សាទុកព័ត៌មាន',

        // Placeholders
        enterName: 'បញ្ចូលឈ្មោះពេញរបស់អ្នក',
        enterPhone: 'បញ្ចូលលេខទូរស័ព្ទរបស់អ្នក',
        enterNote: 'ការណែនាំពិសេស ឬកំណត់ចំណាំ',
        tapMap: 'ចុចលើផែនទីដើម្បីជ្រើសរើសទីតាំង',

        // Cart Modal
        yourCart: '🛒 កន្ត្រករបស់អ្នក',
        emptyCart: 'កន្ត្រករបស់អ្នកគឺទទេ',
        subtotal: 'សរុបរង',
        total: 'សរុប',
        placeOrder: '📦 បញ្ជាទិញ',
        clearCart: 'សម្អាតកន្ត្រក',
        items: 'មុខទំនិញ',
        each: 'នីមួយៗ',
        print: 'បោះពុម្ព',
        download: 'ទាញយក',

        // Success Modal
        orderSuccess: 'បានបញ្ជាទិញដោយជោគជ័យ!',
        orderSuccessMsg: 'ការបញ្ជាទិញរបស់អ្នកត្រូវបានផ្ញើទៅក្រុមការងាររបស់យើង។ យើងនឹងទាក់ទងអ្នកក្នុងពេលឆាប់ៗ។',
        continueShopping: 'បន្តទិញទំនិញ',

        // Loading
        sendingOrder: 'កំពុងផ្ញើការបញ្ជាទិញ...',

        // Store Info
        storeTagline: 'អ្នកអាចរកបានអ្វីៗគ្រប់ប្រភេទសំភារៈផ្ទះត្រាវក្រោងបំផុតសម្រាប់ផ្ទះ',
        storePhone: 'លេខទូរស័ព្ទ',
        storeHours: 'ម៉ោងបើកអាជីវកម្ម',
        storeHoursValue: 'ច័ន្ទ - អាទិត្យ: ម៉ោង 8:00 ព្រឹក - 8:00 ល្ងាច',
        storeAddress: 'អាសយដ្ឋាន',
        storeAddressValue: 'ភ្នំពេញ កម្ពុជា',

        // Alerts
        alertFillAll: 'សូមបំពេញព័ត៌មានទាំងអស់',
        alertEnterName: 'សូមបញ្ចូលឈ្មោះរបស់អ្នក',
        alertEnterPhone: 'សូមបញ្ចូលលេខទូរស័ព្ទរបស់អ្នក',
        alertSelectLocation: 'សូមចុចលើផែនទីដើម្បីជ្រើសរើសទីតាំងរបស់អ្នក',
        alertSaved: 'បានរក្សាទុកព័ត៌មានដោយជោគជ័យ!',
        alertSignUp: 'សូមចុះឈ្មោះមុនពេលបញ្ជាទិញ',
        alertEmptyCart: 'កន្ត្រករបស់អ្នកគឺទទេ',
        alertClearCart: 'សម្អាតទំនិញទាំងអស់ចេញពីកន្ត្រក?',
        alertOrderFailed: 'បរាជ័យក្នុងការបញ្ជាទិញ។ សូមព្យាយាមម្តងទៀត ឬទាក់ទងមកយើងដោយផ្ទាល់។',

        // Payment
        paymentTitle: 'បង់ប្រាក់តាម ABA PayWay',
        paymentSubtitle: 'ស្កេន QR ឬចុច Pay Now ដើម្បីបង់ប្រាក់',
        payStep1: 'ស្កេន QR code ដោយប្រើកម្មវិធីធនាគារ',
        payStep2: 'ឬចុច "Pay Now" ដើម្បីបើកកម្មវិធី ABA',
        payStep3: 'បញ្ចប់ការបង់ប្រាក់',
        payStep4: 'ការបង់ប្រាក់នឹងត្រូវបានផ្ទៀងផ្ទាត់ដោយស្វ័យប្រវត្តិ',
        cancelPayment: 'បោះបង់',
        payNow: '💳 បង់ប្រាក់ឥឡូវនេះ',
        creatingPayment: 'កំពុងបង្កើតការបង់ប្រាក់...',
        waitingPayment: 'រង់ចាំការបង់ប្រាក់...',
        paymentVerified: '✅ ការបង់ប្រាក់ត្រូវបានផ្ទៀងផ្ទាត់!',
        paymentFailed: '❌ ការបង់ប្រាក់បរាជ័យ',
        paymentTimeout: '⏰ ការបង់ប្រាក់ផុតកំណត់',
        paymentPending: '⏳ រង់ចាំការបង់ប្រាក់',
        paymentConfirmed: '✅ បានបង់ប្រាក់រួចហើយ',
        receiptIntro: 'សូមអរគុណសម្រាប់ការបញ្ជាទិញរបស់អ្នក!',
        receiptItems: 'មុខទំនិញដែលបានបញ្ជាទិញ',
        receiptTotal: 'សរុប',
        receiptNote: 'យើងនឹងដឹកជញ្ជូនការបញ្ជាទិញរបស់អ្នកឆាប់ៗ។ សូមអរគុណដែលបានទិញជាមួយ Sambo Store!'
    }
};

// Language toggle
const toggleLanguage = () => {
    currentLang = currentLang === 'en' ? 'kh' : 'en';
    localStorage.setItem('lang', currentLang);
    applyTranslations();
    updateLangButton();
};

const updateLangButton = () => {
    const langBtn = document.getElementById('langBtn');
    langBtn.textContent = currentLang === 'en' ? 'KH' : 'EN';
};

const applyTranslations = () => {
    const t = translations[currentLang];

    // Update all elements with data-translate attribute
    document.querySelectorAll('[data-translate]').forEach(el => {
        const key = el.dataset.translate;
        if (t[key]) {
            el.textContent = t[key];
        }
    });

    // Update placeholders
    document.querySelectorAll('[data-placeholder]').forEach(el => {
        const key = el.dataset.placeholder;
        if (t[key]) {
            el.placeholder = t[key];
        }
    });

    // Update profile button text based on login state
    const profileBtn = document.getElementById('profileBtnText');
    if (userInfo) {
        profileBtn.textContent = t.profile;
    } else {
        profileBtn.textContent = t.signUp;
    }
};
