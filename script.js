const CART_KEY = 'northgateCartItems';
const LEGACY_CART_KEY = 'northStarCartItems';
const DEMO_ACCOUNT_KEY = 'northgateDemoAccount';
const LEGACY_DEMO_ACCOUNT_KEY = 'northStarDemoAccount';
const DEMO_ORDERS_KEY = 'northgateDemoOrders';
const DELIVERY_LOCATION_KEY = 'northgateDeliveryLocation';
const LEGACY_DELIVERY_LOCATION_KEY = 'northStarDeliveryLocation';
const DELIVERY_COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK'.split(' ');
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=700&q=80';
let currentAccount = null;
let accountAuthMode = 'server';

function firebaseAccount(user) {
  if (!user) return null;
  const displayName = user.displayName || user.email?.split('@')[0] || 'Member';
  return {
    id: user.uid,
    email: user.email || '',
    displayName,
    username: displayName,
    name: user.displayName || '',
    phone: user.phoneNumber || '',
    avatarImage: user.photoURL || '',
    createdAt: user.metadata?.creationTime || '',
    isAdmin: false,
  };
}

async function apiRequest(path, options = {}) {
  const headers = { Accept: 'application/json', ...options.headers };
  const requestOptions = { ...options, credentials: 'same-origin', headers };
  if (options.body && typeof options.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    requestOptions.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(path, requestOptions);
  } catch (error) {
    throw new Error('Northgate could not reach its account server. Start it with "python server.py" and open http://127.0.0.1:8080.');
  }

  let payload = {};
  const isJsonResponse = response.headers.get('content-type')?.includes('application/json');
  if (isJsonResponse) {
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error('Northgate received an invalid response from its account server. Restart it with "python server.py".');
    }
  } else if (!response.ok && [405, 501].includes(response.status)) {
    throw new Error('This static web server cannot create accounts. Start Northgate with "python server.py" and open http://127.0.0.1:8080.');
  } else {
    throw new Error('Northgate received an invalid response from its account server. Start it with "python server.py" and open http://127.0.0.1:8080.');
  }

  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `The request failed (${response.status}). Try again.`);
  }
  return payload;
}

function normalizeImageSource(value) {
  if (!value || typeof value !== 'string') return FALLBACK_IMAGE;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('photo-')) return `https://images.unsplash.com/${value}?auto=format&fit=crop&w=700&q=80`;
  return FALLBACK_IMAGE;
}

const storage = {
  get(key, fallback, legacyKey = null) {
    try {
      const rawValue = localStorage.getItem(key);
      if (rawValue) return JSON.parse(rawValue);
      if (legacyKey) {
        const legacyValue = localStorage.getItem(legacyKey);
        if (legacyValue) return JSON.parse(legacyValue);
      }
      return fallback;
    } catch (error) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  },
};

const catalogProducts = [
  { id: 'linen-cushion-set', name: 'Linen Cushion Set', category: 'Home essentials', price: 32.99, rating: '4.7', image: 'photo-1584100936595-c0654b55a2e2', alt: 'Soft decorative cushions' },
  { id: 'ceramic-table-lamp', name: 'Ceramic Table Lamp', category: 'Home essentials', price: 48.00, rating: '4.6', image: 'photo-1507473885765-e6ed057f782c', alt: 'Modern table lamp' },
  { id: 'wireless-noise-canceling-headphones', name: 'Wireless Noise-Canceling Headphones', category: 'Electronics', price: 129.99, rating: '4.8', image: 'photo-1505740420928-5e560c06d30e', alt: 'Over-ear wireless headphones' },
  { id: 'compact-bluetooth-speaker', name: 'Compact Bluetooth Speaker', category: 'Electronics', price: 54.50, rating: '4.5', image: 'photo-1608043152269-423dbba4e7e1', alt: 'Portable Bluetooth speaker' },
  { id: 'everyday-canvas-sneakers', name: 'Everyday Canvas Sneakers', category: 'Fashion', price: 68.00, rating: '4.6', image: 'photo-1542291026-7eec264c27ff', alt: 'Red athletic sneakers' },
  { id: 'classic-crossbody-bag', name: 'Classic Crossbody Bag', category: 'Fashion', price: 42.95, rating: '4.7', image: 'photo-1548036328-c9fa89d128fa', alt: 'Structured crossbody bag' },
  { id: 'hydrating-face-serum', name: 'Hydrating Face Serum', category: 'Beauty', price: 24.00, rating: '4.8', image: 'photo-1608248543803-ba4f8c70ae0b', alt: 'Skincare serum bottle' },
  { id: 'daily-glow-skin-set', name: 'Daily Glow Skin Set', category: 'Beauty', price: 38.50, rating: '4.5', image: 'photo-1556229010-6c3f2c9ca5f8', alt: 'Skincare and beauty products' },
  { id: 'pour-over-coffee-set', name: 'Pour-Over Coffee Set', category: 'Kitchen', price: 36.99, rating: '4.7', image: 'photo-1495474472287-4d71bcdd2085', alt: 'Coffee brewing setup' },
  { id: 'stainless-steel-cookware', name: 'Stainless Steel Cookware', category: 'Kitchen', price: 89.00, rating: '4.6', image: 'photo-1556911220-bff31c812dba', alt: 'Stainless steel cookware' },
  { id: 'adjustable-desk-organizer', name: 'Adjustable Desk Organizer', category: 'Office', price: 29.99, rating: '4.5', image: 'photo-1498050108023-c5249f4df085', alt: 'Organized modern desk' },
  { id: 'ergonomic-wireless-mouse', name: 'Ergonomic Wireless Mouse', category: 'Office', price: 39.95, rating: '4.7', image: 'photo-1527864550417-7fd91fc51a46', alt: 'Wireless computer mouse' },
  { id: 'insulated-steel-water-bottle', name: 'Insulated Steel Water Bottle', category: 'Fitness', price: 22.00, rating: '4.8', image: 'photo-1602143407151-7111542de6e8', alt: 'Reusable stainless water bottle' },
  { id: 'resistance-band-training-set', name: 'Resistance Band Training Set', category: 'Fitness', price: 27.50, rating: '4.6', image: 'photo-1517836357463-d25dfeac3438', alt: 'Strength training workout' },
];

const newArrivalProducts = [
  { id: 'pocket-instant-camera', name: 'Pocket Instant Camera', category: 'Electronics', price: 89.99, rating: '4.8', image: 'photo-1516035069371-29a1b244cc32', alt: 'Compact camera for everyday photos', badge: 'Just in' },
  { id: 'commuter-rolltop-backpack', name: 'Commuter Rolltop Backpack', category: 'Fashion', price: 72.00, rating: '4.7', image: 'photo-1553062407-98eeb64c6a62', alt: 'Versatile travel backpack', badge: 'Just in' },
  { id: 'ceramic-planter-trio', name: 'Ceramic Planter Trio', category: 'Home essentials', price: 34.50, rating: '4.6', image: 'photo-1485955900006-10f4d324d411', alt: 'Green indoor plant in a planter', badge: 'Just in' },
  { id: 'performance-yoga-mat', name: 'Performance Yoga Mat', category: 'Fitness', price: 39.00, rating: '4.8', image: 'photo-1599447421416-3414500d18a5', alt: 'Yoga and fitness practice', badge: 'Just in' },
  { id: 'hardcover-daily-journal', name: 'Hardcover Daily Journal', category: 'Office', price: 18.00, rating: '4.5', image: 'photo-1494438639946-1ebd1d20bf85', alt: 'Books and stationery on a desk', badge: 'Just in' },
  { id: 'relaxed-linen-shirt', name: 'Relaxed Linen Shirt', category: 'Fashion', price: 49.99, rating: '4.6', image: 'photo-1490481651871-ab68de25d43d', alt: 'Seasonal clothing collection', badge: 'Just in' },
  { id: 'glass-meal-prep-set', name: 'Glass Meal Prep Set', category: 'Kitchen', price: 32.99, rating: '4.7', image: 'photo-1546069901-ba9599a7e63c', alt: 'Freshly prepared meal', badge: 'Just in' },
  { id: 'botanical-hand-cream-trio', name: 'Botanical Hand Cream Trio', category: 'Beauty', price: 21.00, rating: '4.6', image: 'photo-1608571423902-eed4a5ad8108', alt: 'Botanical skincare products', badge: 'Just in' },
  { id: 'wireless-folding-keyboard', name: 'Wireless Folding Keyboard', category: 'Electronics', price: 44.95, rating: '4.5', image: 'photo-1516321318423-f06f85e504b3', alt: 'Portable technology for work', badge: 'Just in' },
  { id: 'sculptural-ceramic-vase', name: 'Sculptural Ceramic Vase', category: 'Home essentials', price: 28.50, rating: '4.7', image: 'photo-1578749556568-bc2c40e68b61', alt: 'Decorative ceramic vase', badge: 'Just in' },
];

const dealProducts = [
  { id: 'studio-wireless-headphones', name: 'Studio Wireless Headphones', category: 'Electronics', price: 89.99, compareAtPrice: 129.99, rating: '4.8', image: 'photo-1505740420928-5e560c06d30e', alt: 'Over-ear wireless headphones', badge: 'Save 31%' },
  { id: 'compact-air-fryer', name: 'Compact Air Fryer', category: 'Kitchen', price: 59.99, compareAtPrice: 84.99, rating: '4.7', image: 'photo-1556911220-bff31c812dba', alt: 'Modern kitchen cookware', badge: 'Save 29%' },
  { id: 'weekender-travel-bag', name: 'Weekender Travel Bag', category: 'Fashion', price: 47.99, compareAtPrice: 69.99, rating: '4.6', image: 'photo-1548036328-c9fa89d128fa', alt: 'Structured travel bag', badge: 'Save 31%' },
  { id: 'smart-desk-lamp-pro', name: 'Smart Desk Lamp Pro', category: 'Office', price: 39.99, compareAtPrice: 59.99, rating: '4.7', image: 'photo-1507473885765-e6ed057f782c', alt: 'Modern desk lamp', badge: 'Save 33%' },
  { id: 'daily-hydration-serum-set', name: 'Daily Hydration Serum Set', category: 'Beauty', price: 27.99, compareAtPrice: 39.99, rating: '4.8', image: 'photo-1608248543803-ba4f8c70ae0b', alt: 'Hydrating skincare serum', badge: 'Save 30%' },
  { id: 'adjustable-dumbbell-set', name: 'Adjustable Dumbbell Set', category: 'Fitness', price: 69.99, compareAtPrice: 99.99, rating: '4.6', image: 'photo-1517836357463-d25dfeac3438', alt: 'Strength training workout', badge: 'Save 30%' },
  { id: 'portable-bluetooth-speaker', name: 'Portable Bluetooth Speaker', category: 'Electronics', price: 42.99, compareAtPrice: 59.99, rating: '4.5', image: 'photo-1608043152269-423dbba4e7e1', alt: 'Compact Bluetooth speaker', badge: 'Save 28%' },
  { id: 'artisan-pour-over-kit', name: 'Artisan Pour-Over Kit', category: 'Kitchen', price: 28.99, compareAtPrice: 39.99, rating: '4.7', image: 'photo-1495474472287-4d71bcdd2085', alt: 'Coffee brewing setup', badge: 'Save 28%' },
];

const featuredProducts = [
  { id: 'wireless-earbuds-pro', name: 'Wireless Earbuds Pro', category: 'Electronics', price: 79.99, rating: '4.7', image: 'photo-1546868871-7041f2a55e12', alt: 'Wireless earbuds', badge: 'Best Seller' },
  { id: 'smartwatch-max', name: 'SmartWatch Max', category: 'Electronics', price: 149, rating: '4.8', image: 'photo-1523275335684-37898b6baf30', alt: 'Smartwatch', badge: 'Trending' },
  { id: 'modern-laptop-air-13', name: 'Modern Laptop Air 13', category: 'Electronics', price: 899.99, rating: '4.9', image: 'photo-1583394838336-acd977736f90', alt: 'Laptop', badge: 'Hot deal' },
  { id: 'desk-air-purifier', name: 'Desk Air Purifier', category: 'Home essentials', price: 64.99, rating: '4.6', image: 'photo-1521572267360-ee0c2909d518', alt: 'Desk air purifier', badge: 'New' },
];

const allProducts = [...featuredProducts, ...dealProducts, ...newArrivalProducts, ...catalogProducts];

function productImageUrl(product, width = 900) {
  return `https://images.unsplash.com/${product.image}?auto=format&fit=crop&w=${width}&q=85`;
}

function productDescription(product) {
  const descriptions = {
    'Home essentials': 'A considered everyday upgrade for a more comfortable, thoughtfully arranged home.',
    Electronics: 'Reliable everyday technology, selected to make work, entertainment, and daily routines feel effortless.',
    Fashion: 'An easy-to-wear essential that brings practical design and considered style together.',
    Beauty: 'A simple addition to your daily routine, selected for an enjoyable, easy-to-use experience.',
    Kitchen: 'A useful kitchen essential designed to make everyday preparation a little easier.',
    Office: 'A practical workspace upgrade designed to help keep your day comfortable and organized.',
    Fitness: 'A versatile training and wellness essential to support your everyday movement routine.',
  };
  return descriptions[product.category] || 'A Northgate favorite, selected for quality, everyday usefulness, and lasting value.';
}

function productCardMarkup(product) {
  return `
    <article class="product-card" data-product-id="${product.id}" data-category="${product.category.toLowerCase()}" data-search="${product.name.toLowerCase()} ${product.category.toLowerCase()}">
      ${product.badge ? `<div class="product-badge">${product.badge}</div>` : ''}
      <a class="product-image-link" href="product.html?id=${product.id}" aria-label="View ${product.name} details"><img src="${productImageUrl(product, 700)}" alt="${product.alt}" loading="lazy" /></a>
      <div class="product-info">
        <p class="catalog-category">${product.category}</p>
        <h3><a class="product-detail-link" href="product.html?id=${product.id}">${product.name}</a></h3>
        <div class="rating">★★★★★ <span>${product.rating}</span></div>
        <div class="price-row">
          ${product.compareAtPrice ? `<span class="deal-old-price">$${product.compareAtPrice.toFixed(2)}</span>` : ''}
          <span class="price">$${product.price.toFixed(2)}</span>
          <span class="prime-tag">Prime</span>
        </div>
        <button class="add-cart" type="button">Add to cart</button>
      </div>
    </article>
  `;
}

function renderProductCollection(containerId, products) {
  const container = document.getElementById(containerId);
  if (container) container.innerHTML = products.map(productCardMarkup).join('');
}

function renderCatalogProducts() {
  renderProductCollection('catalog-products', catalogProducts);
}

function renderHomepageCollections() {
  renderProductCollection('deal-products', dealProducts);
  renderProductCollection('new-arrivals-products', newArrivalProducts);

  const dealCount = document.getElementById('deal-product-count');
  if (dealCount) dealCount.textContent = `${dealProducts.length} offers`;
  const arrivalCount = document.getElementById('new-arrival-count');
  if (arrivalCount) arrivalCount.textContent = `${newArrivalProducts.length} fresh finds`;
}

function renderProductDetail() {
  const detailContainer = document.getElementById('product-detail');
  if (!detailContainer) return;

  const productId = new URLSearchParams(window.location.search).get('id');
  const product = allProducts.find((item) => item.id === productId);

  if (!product) {
    document.title = 'Product not found | Northgate';
    detailContainer.innerHTML = `
      <div class="product-not-found">
        <p class="eyebrow">NORTHGATE CATALOG</p>
        <h1>We couldn't find that product.</h1>
        <p>It may have moved or is no longer available.</p>
        <a class="primary-btn" href="index.html#catalog">Browse the catalog</a>
      </div>
    `;
    return;
  }

  const imageUrl = productImageUrl(product);
  document.title = `${product.name} | Northgate`;
  const breadcrumbName = document.getElementById('product-breadcrumb-name');
  if (breadcrumbName) breadcrumbName.textContent = product.name;
  detailContainer.innerHTML = `
    <div class="product-detail-image-wrap">
      <img class="product-detail-image" src="${imageUrl}" alt="${product.alt}" />
    </div>
    <section class="product-detail-info" aria-labelledby="product-detail-title">
      <p class="product-detail-category">${product.category}</p>
      <h1 id="product-detail-title">${product.name}</h1>
      <p class="product-detail-rating"><span aria-label="5 out of 5 stars">★★★★★</span> ${product.rating} customer rating</p>
      <p class="product-detail-price">${product.compareAtPrice ? `<span class="deal-old-price">$${product.compareAtPrice.toFixed(2)}</span> ` : ''}$${product.price.toFixed(2)}</p>
      <p class="product-detail-description">${productDescription(product)}</p>
      <ul class="product-detail-points">
        <li>Selected by Northgate for everyday value</li>
        <li>Free returns within 30 days</li>
        <li>Secure checkout demonstration</li>
      </ul>
      <p class="product-detail-stock"><span aria-hidden="true"></span> In stock</p>
      <label class="product-quantity-label" for="product-quantity">Quantity</label>
      <select id="product-quantity" aria-label="Quantity">
        <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option>
      </select>
      <button class="primary-btn product-add-cart" type="button" data-product-id="${product.id}">Add to cart</button>
      <p class="product-demo-note">Product listing demo. Availability and order placement are not connected to a live store.</p>
    </section>
  `;
}

function sortCatalogProducts(cards, mode = 'featured') {
  const sorted = [...cards];
  const getPrice = (card) => Number(card.dataset.price || card.querySelector('.price')?.textContent.replace(/[^0-9.]/g, '') || 0);

  sorted.sort((firstCard, secondCard) => {
    const firstName = firstCard.querySelector('h3')?.textContent.trim() || '';
    const secondName = secondCard.querySelector('h3')?.textContent.trim() || '';

    switch (mode) {
      case 'price-asc':
        return getPrice(firstCard) - getPrice(secondCard);
      case 'price-desc':
        return getPrice(secondCard) - getPrice(firstCard);
      case 'name-asc':
        return firstName.localeCompare(secondName);
      case 'featured':
      default:
        return 0;
    }
  });

  return sorted;
}

function filterCatalog() {
  const searchInput = document.querySelector('.search-bar input');
  const cards = [...document.querySelectorAll('.product-card')];
  const resultCount = document.getElementById('catalog-result-count');
  const emptyMessage = document.getElementById('catalog-empty');
  const catalogContainer = document.getElementById('catalog-products');
  const sortSelect = document.getElementById('catalog-sort');
  const sortMode = sortSelect?.value || 'featured';
  const term = searchInput?.value.trim().toLowerCase() || '';
  const selectedCategory = document.querySelector('[data-category-filter][aria-pressed="true"]')?.dataset.categoryFilter || 'all';
  let visibleCatalogCount = 0;
  let visibleProductCount = 0;

  cards.forEach((card) => {
    const productCategory = card.dataset.category || '';
    const matchesTerm = !term || `${card.dataset.search || ''} ${card.querySelector('h3')?.textContent.toLowerCase() || ''} ${productCategory}`.includes(term);
    const matchesCategory = selectedCategory === 'all' || productCategory === selectedCategory;
    const matches = matchesTerm && matchesCategory;
    card.hidden = !matches;
    if (matches) visibleProductCount += 1;
    if (matches && card.closest('#catalog-products')) visibleCatalogCount += 1;
  });

  if (catalogContainer) {
    const allCatalogCards = [...catalogContainer.querySelectorAll('.product-card')];
    const visibleCatalogCards = allCatalogCards.filter((card) => !card.hidden);
    const sortedCatalogCards = sortCatalogProducts(visibleCatalogCards, sortMode);
    const remainingHiddenCards = allCatalogCards.filter((card) => card.hidden);

    catalogContainer.replaceChildren(...[...sortedCatalogCards, ...remainingHiddenCards]);
  }

  document.querySelectorAll('.products').forEach((section) => {
    const sectionCards = [...section.querySelectorAll('.product-card')];
    section.hidden = sectionCards.length > 0 && !sectionCards.some((card) => !card.hidden);
  });

  if (resultCount) resultCount.textContent = `${visibleCatalogCount} product${visibleCatalogCount === 1 ? '' : 's'}`;

  if (emptyMessage) {
    emptyMessage.hidden = visibleCatalogCount !== 0;
    emptyMessage.textContent = visibleProductCount
      ? 'Matching featured, deal, or new arrival products are shown above.'
      : 'No products match your search. Try a different name or category.';
  }
}

function normalizeCartItem(item) {
  if (!item || typeof item !== 'object') return null;

  const quantity = Number(item.quantity || 1);
  const price = Number(item.price || 0);
  const name = typeof item.name === 'string' ? item.name.trim() : '';

  if (!name) return null;

  return {
    ...item,
    id: item.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    price: Number.isFinite(price) ? price : 0,
    image: normalizeImageSource(item.image),
  };
}

function getCartItems() {
  const saved = storage.get(CART_KEY, [], LEGACY_CART_KEY);
  return Array.isArray(saved) ? saved.map(normalizeCartItem).filter(Boolean) : [];
}

function saveCartItems(items) {
  const nextItems = (Array.isArray(items) ? items : []).map(normalizeCartItem).filter(Boolean);
  storage.set(CART_KEY, nextItems);
}

function getDemoAccount() {
  return currentAccount;
}

function updateAccountHeader() {
  const account = getDemoAccount();
  document.querySelectorAll('.account-trigger').forEach((trigger) => {
    const avatar = trigger.querySelector('.account-avatar');
    const avatarImage = avatar?.querySelector('.account-avatar-photo');
    const avatarIcon = avatar?.querySelector('svg');
    const greeting = trigger.querySelector('.account-greeting');
    const label = trigger.querySelector('.account-copy strong');
    if (avatar) avatar.hidden = !account;
    if (avatarImage) {
      avatarImage.hidden = !account?.avatarImage;
      if (account?.avatarImage) avatarImage.src = account.avatarImage;
      else avatarImage.removeAttribute('src');
    }
    if (avatarIcon) avatarIcon.hidden = Boolean(account?.avatarImage);
    if (greeting) greeting.textContent = account ? account.displayName : 'sign in';
    if (label) label.textContent = account ? 'Your account' : 'Account & Lists';
    trigger.setAttribute('aria-label', account ? `Your account, ${account.displayName}` : 'Sign in or create account');
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

async function renderAccountPurchases(container) {
  if (!container) return;
  container.innerHTML = '<div class="account-state account-state-loading" role="status">Loading your purchases...</div>';

  let orders;
  try {
    const response = await apiRequest('/api/orders');
    orders = response.orders;
  } catch (error) {
    container.innerHTML = `
      <div class="account-state account-state-error" role="alert">
        <p>${escapeHtml(error.message)}</p>
        <button type="button" data-account-action="retry-orders">Try again</button>
      </div>
    `;
    return;
  }

  if (!orders.length) {
    container.innerHTML = `
      <div class="account-orders-empty" role="status">
        <h2>No purchases yet</h2>
        <p>Orders you place will appear here.</p>
        <a class="primary-btn" href="index.html#products">Continue shopping</a>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map((order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    const placedDate = new Date(order.createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const itemQuantity = items.reduce((total, item) => total + Number(item.quantity || 1), 0);
    const canCancel = order.status === 'Processing';
    const itemsMarkup = items.map((item) => {
      const name = escapeHtml(item.name);
      const image = escapeHtml(normalizeImageSource(item.image));
      const quantity = Number(item.quantity || 1);
      const lineTotal = Number(item.price || 0) * quantity;
      return `
        <div class="account-order-item">
          <img src="${image}" alt="${name}" loading="lazy" />
          <div class="account-order-item-copy">
            <strong>${name}</strong>
            <span>Qty ${quantity}</span>
          </div>
          <strong class="account-order-item-price">$${lineTotal.toFixed(2)}</strong>
        </div>
      `;
    }).join('');

    return `
      <article class="account-order-card">
        <header class="account-order-header">
          <div>
            <strong>Order ${escapeHtml(order.id)}</strong>
            <time datetime="${escapeHtml(order.createdAt)}">Placed ${placedDate}</time>
          </div>
          <div class="account-order-actions">
            <span class="account-order-status">${escapeHtml(order.status)}</span>
            ${canCancel ? `<button class="account-order-cancel" type="button" data-order-action="start-cancel" data-order-id="${escapeHtml(order.id)}">Cancel order</button>` : ''}
          </div>
        </header>
        ${canCancel ? `
          <div class="account-order-cancel-confirm" hidden>
            <span>Cancel this demo order?</span>
            <div>
              <button type="button" data-order-action="keep-order">Keep order</button>
              <button type="button" data-order-action="confirm-cancel" data-order-id="${escapeHtml(order.id)}">Confirm cancellation</button>
            </div>
          </div>
        ` : ''}
        <div class="account-order-items">${itemsMarkup}</div>
        <footer class="account-order-footer">
          <span>${itemQuantity} item${itemQuantity === 1 ? '' : 's'}</span>
          <strong>Total $${Number(order.total || 0).toFixed(2)}</strong>
        </footer>
      </article>
    `;
  }).join('');
}

const ADMIN_ORDER_TRANSITIONS = {
  Processing: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered'],
  Delivered: [],
  Cancelled: [],
};

async function renderAdminOrders(container) {
  if (!container) return;
  container.innerHTML = '<div class="account-state account-state-loading" role="status">Loading orders...</div>';

  let orders;
  try {
    const response = await apiRequest('/api/admin/orders');
    orders = response.orders;
  } catch (error) {
    container.innerHTML = `
      <div class="account-state account-state-error" role="alert">
        <p>${escapeHtml(error.message)}</p>
        <button type="button" data-admin-action="retry">Try again</button>
      </div>
    `;
    return;
  }

  if (!orders.length) {
    container.innerHTML = `
      <div class="account-orders-empty" role="status">
        <h2>No orders yet</h2>
        <p>New demo orders will appear here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map((order) => {
    const nextStatuses = ADMIN_ORDER_TRANSITIONS[order.status] || [];
    const itemCount = order.items.reduce((total, item) => total + Number(item.quantity || 0), 0);
    const address = order.address;
    const formattedAddress = [
      address.street,
      `${address.city} ${address.postalCode}`.trim(),
    ].filter(Boolean).join(', ');
    const placedDate = new Date(order.createdAt).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return `
      <article class="account-order-card admin-order-card">
        <header class="account-order-header">
          <div>
            <strong>Order ${escapeHtml(order.id)}</strong>
            <time datetime="${escapeHtml(order.createdAt)}">Placed ${escapeHtml(placedDate)}</time>
          </div>
          <span class="account-order-status">${escapeHtml(order.status)}</span>
        </header>
        <div class="admin-order-customer">
          <strong>${escapeHtml(order.customerName)}</strong>
          <span>${escapeHtml(order.customerEmail)}</span>
          <span>${escapeHtml(order.phone)}</span>
          <span>${escapeHtml(formattedAddress)}</span>
        </div>
        <div class="account-order-items">
          ${order.items.map((item) => `
            <div class="admin-order-item">
              <span>${escapeHtml(item.name)} · Qty ${Number(item.quantity)}</span>
              <strong>$${(Number(item.price) * Number(item.quantity)).toFixed(2)}</strong>
            </div>
          `).join('')}
        </div>
        <footer class="account-order-footer admin-order-footer">
          <span>${itemCount} item${itemCount === 1 ? '' : 's'}</span>
          <strong>Total $${Number(order.total).toFixed(2)}</strong>
        </footer>
        ${nextStatuses.length ? `
          <form class="admin-order-status-form" data-admin-order-id="${escapeHtml(order.id)}">
            <label>
              Update status
              <select name="status" required>
                <option value="" selected disabled>Choose next status</option>
                ${nextStatuses.map((nextStatus) => `<option value="${escapeHtml(nextStatus)}">${escapeHtml(nextStatus)}</option>`).join('')}
              </select>
            </label>
            <button class="secondary-btn" type="submit">Save status</button>
          </form>
        ` : '<p class="admin-order-terminal">This order is complete and its status can no longer change.</p>'}
      </article>
    `;
  }).join('');
}

async function initializeAdminPage() {
  const ordersPanel = document.getElementById('admin-orders');
  const accessMessage = document.getElementById('admin-access-message');
  const signoutButton = document.getElementById('admin-signout');
  if (!ordersPanel || !accessMessage) return;

  if (!currentAccount) {
    window.location.replace('index.html?signin=1');
    return;
  }
  if (!currentAccount.isAdmin) {
    ordersPanel.hidden = true;
    accessMessage.textContent = 'Your account does not have administrator access.';
    accessMessage.hidden = false;
    return;
  }

  signoutButton?.addEventListener('click', async () => {
    signoutButton.disabled = true;
    try {
      if (accountAuthMode === 'firebase') {
        await window.northgateFirebaseAuth.signOut();
      } else {
        await apiRequest('/api/logout', { method: 'POST' });
      }
      currentAccount = null;
      window.location.href = 'index.html';
    } catch (error) {
      accessMessage.textContent = error.message;
      accessMessage.hidden = false;
      signoutButton.disabled = false;
    }
  });

  await renderAdminOrders(ordersPanel);
  ordersPanel.addEventListener('click', async (event) => {
    const retryButton = event.target.closest('button[data-admin-action="retry"]');
    if (retryButton) await renderAdminOrders(ordersPanel);
  });
  ordersPanel.addEventListener('submit', async (event) => {
    const form = event.target.closest('form[data-admin-order-id]');
    if (!form) return;
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    const statusSelect = form.elements.status;
    const selectedStatus = statusSelect.value;
    submitButton.disabled = true;
    try {
      await apiRequest(`/api/admin/orders/${encodeURIComponent(form.dataset.adminOrderId)}/status`, {
        method: 'PUT',
        body: { status: selectedStatus },
      });
      await renderAdminOrders(ordersPanel);
    } catch (error) {
      form.insertAdjacentHTML('beforeend', `<p class="account-inline-error" role="alert">${escapeHtml(error.message)}</p>`);
      submitButton.disabled = false;
    }
  });
}

async function renderAccountAddresses(container) {
  if (!container) return [];
  container.innerHTML = '<div class="account-state account-state-loading" role="status">Loading your addresses...</div>';

  try {
    const response = await apiRequest('/api/addresses');
    const addresses = response.addresses;
    if (!addresses.length) {
      container.innerHTML = '<div class="account-orders-empty" role="status"><h2>No saved addresses</h2><p>Add an address for faster checkout.</p></div>';
      return addresses;
    }

    container.innerHTML = addresses.map((address) => `
      <article class="account-address-card" data-address-id="${escapeHtml(address.id)}">
        <header>
          <strong>${escapeHtml(address.label)}</strong>
          ${address.isDefault ? '<span class="account-order-status">Default</span>' : ''}
        </header>
        <p><strong>${escapeHtml(address.recipient)}</strong> · ${escapeHtml(address.phone)}</p>
        <p>${escapeHtml(address.street)}, ${escapeHtml(address.city)} ${escapeHtml(address.postalCode)}, ${escapeHtml(address.country)}</p>
        <div class="account-address-actions">
          <button type="button" data-address-action="edit">Edit</button>
          ${address.isDefault ? '' : '<button type="button" data-address-action="default">Set as default</button>'}
          <button type="button" data-address-action="delete">Remove</button>
        </div>
      </article>
    `).join('');
    return addresses;
  } catch (error) {
    container.innerHTML = `
      <div class="account-state account-state-error" role="alert">
        <p>${escapeHtml(error.message)}</p>
        <button type="button" data-address-action="retry">Try again</button>
      </div>
    `;
    return [];
  }
}

async function initializeAccountPage() {
  const accountForm = document.getElementById('account-profile-form');
  if (!accountForm) return;

  let existing = getDemoAccount();
  if (!existing) {
    window.location.replace('index.html?signin=1');
    return;
  }

  const accountUserName = document.getElementById('account-user-name');
  const accountSidebarAvatar = document.getElementById('account-avatar-sidebar');
  const accountMainAvatar = document.getElementById('account-main-avatar');
  const signoutButton = document.getElementById('account-signout');
  const purchasesPanel = document.getElementById('account-purchases');
  const addressesPanel = document.getElementById('account-addresses');
  const passwordPanel = document.getElementById('account-password');
  const staticPanel = document.getElementById('account-static-view');
  const addressList = document.getElementById('account-address-list');
  const addressForm = document.getElementById('account-address-form');
  const addressStatus = document.getElementById('account-address-status');
  const passwordForm = document.getElementById('account-password-form');
  const passwordStatus = document.getElementById('account-password-status');
  const pageTitle = document.getElementById('account-page-title');
  const pageSubtitle = document.getElementById('account-page-subtitle');
  const imageInput = document.getElementById('account-image-input');
  const imageSelectButton = document.getElementById('account-image-select');
  const status = document.getElementById('account-profile-status');
  let avatarImage = existing.avatarImage || '';

  if (accountAuthMode === 'firebase' && status) {
    status.textContent = 'You are signed in with Firebase Authentication. Profile edits, addresses, password changes, and orders still need the Northgate Python API.';
  }

  signoutButton?.addEventListener('click', async () => {
    signoutButton.disabled = true;
    try {
      await apiRequest('/api/logout', { method: 'POST' });
      currentAccount = null;
      window.location.href = 'index.html';
    } catch (error) {
      signoutButton.disabled = false;
      status.textContent = error.message;
    }
  });

  if (accountUserName) {
    accountUserName.textContent = existing.displayName || 'rgcanda';
  }
  const adminLink = document.getElementById('account-admin-link');
  if (adminLink) adminLink.hidden = !existing.isAdmin;

  const staticViews = {
    'payment-methods': ['Banks & Cards', 'Payment details are not collected or stored in this demo.'],
    privacy: ['Privacy Settings', 'Your account profile and orders are stored in the local Northgate database. Passwords are hashed and never displayed.'],
    'notification-settings': ['Notification Settings', 'Email and push notifications are not configured in this local demo.'],
    'order-settings': ['Order Settings', 'Demo orders can be cancelled while their status is Processing.'],
    notifications: ['Notifications', 'You have no notifications.'],
    vouchers: ['My Vouchers', 'No vouchers are available in this demo.'],
    coins: ['My Northgate Coins', 'Northgate Coins are not enabled in this demo.'],
  };

  const setAccountView = async (view, activeButton = null) => {
    const showProfile = view === 'profile';
    const showPurchases = view === 'purchases';
    const showAddresses = view === 'addresses';
    const showPassword = view === 'password';
    const showStatic = Object.hasOwn(staticViews, view);
    accountForm.hidden = !showProfile;
    purchasesPanel.hidden = !showPurchases;
    addressesPanel.hidden = !showAddresses;
    passwordPanel.hidden = !showPassword;
    staticPanel.hidden = !showStatic;

    const titles = {
      profile: ['My Profile', 'Manage and protect your account'],
      purchases: ['My Purchases', 'Review your orders and items'],
      addresses: ['Addresses', 'Manage your saved delivery addresses'],
      password: ['Change Password', 'Keep your account credentials up to date'],
    };
    const copy = titles[view] || staticViews[view] || titles.profile;
    pageTitle.textContent = copy[0];
    pageSubtitle.textContent = copy[1];
    if (showStatic) {
      document.getElementById('account-static-title').textContent = copy[0];
      document.getElementById('account-static-message').textContent = copy[1];
    }

    document.querySelectorAll('[data-account-view]').forEach((button) => {
      button.classList.toggle('active', activeButton ? button === activeButton : button.dataset.accountView === 'profile' && view === 'profile');
    });
    if (showPurchases) await renderAccountPurchases(purchasesPanel);
    if (showAddresses) await renderAccountAddresses(addressList);
  };

  document.querySelectorAll('[data-account-view]').forEach((button) => {
    button.addEventListener('click', () => {
      setAccountView(button.dataset.accountView, button).catch(() => {});
    });
  });

  purchasesPanel.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-order-action], button[data-account-action]');
    if (!button) return;
    if (button.dataset.accountAction === 'retry-orders') {
      await renderAccountPurchases(purchasesPanel);
      return;
    }

    const card = button.closest('.account-order-card');
    const confirmation = card?.querySelector('.account-order-cancel-confirm');
    if (button.dataset.orderAction === 'start-cancel') {
      confirmation.hidden = false;
      button.hidden = true;
      return;
    }
    if (button.dataset.orderAction === 'keep-order') {
      confirmation.hidden = true;
      card.querySelector('[data-order-action="start-cancel"]')?.removeAttribute('hidden');
      return;
    }
    if (button.dataset.orderAction === 'confirm-cancel') {
      button.disabled = true;
      try {
        await apiRequest(`/api/orders/${encodeURIComponent(button.dataset.orderId)}`, { method: 'DELETE' });
        await renderAccountPurchases(purchasesPanel);
      } catch (error) {
        confirmation.insertAdjacentHTML('beforeend', `<p class="account-inline-error" role="alert">${escapeHtml(error.message)}</p>`);
        button.disabled = false;
      }
    }
  });

  addressList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-address-action]');
    if (!button) return;
    const card = button.closest('.account-address-card');
    const addressId = card?.dataset.addressId;
    const action = button.dataset.addressAction;
    if (action === 'retry') {
      await renderAccountAddresses(addressList);
      return;
    }
    try {
      if (action === 'delete') {
        if (!window.confirm('Remove this saved address?')) return;
        await apiRequest(`/api/addresses/${encodeURIComponent(addressId)}`, { method: 'DELETE' });
      } else {
        const { addresses } = await apiRequest('/api/addresses');
        const address = addresses.find((item) => String(item.id) === addressId);
        if (!address) throw new Error('Address not found. Refresh and try again.');
        if (action === 'edit') {
          addressForm.elements.id.value = address.id;
          addressForm.elements.label.value = address.label;
          addressForm.elements.recipient.value = address.recipient;
          addressForm.elements.phone.value = address.phone;
          addressForm.elements.street.value = address.street;
          addressForm.elements.city.value = address.city;
          addressForm.elements.postalCode.value = address.postalCode;
          addressForm.elements.country.value = address.country;
          addressForm.elements.isDefault.checked = address.isDefault;
          document.getElementById('account-address-form-title').textContent = 'Edit address';
          addressStatus.textContent = '';
          addressForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (action === 'default') {
          await apiRequest('/api/addresses', { method: 'POST', body: { ...address, isDefault: true } });
          await renderAccountAddresses(addressList);
        }
      }
      if (action === 'delete') await renderAccountAddresses(addressList);
    } catch (error) {
      addressStatus.textContent = error.message;
    }
  });

  const requestedView = new URLSearchParams(window.location.search).get('view') || 'profile';
  setAccountView(requestedView, document.querySelector(`[data-account-view="${CSS.escape(requestedView)}"]`)).catch(() => {});

  const fields = {
    username: document.getElementById('account-username'),
    name: document.getElementById('account-name'),
    email: document.getElementById('account-email'),
    phone: document.getElementById('account-phone'),
    gender: document.querySelectorAll('input[name="gender"]'),
    day: document.getElementById('account-day'),
    month: document.getElementById('account-month'),
    year: document.getElementById('account-year'),
  };

  fields.username.value = existing.username || existing.displayName || 'rgcanda';
  fields.name.value = existing.name || existing.displayName || 'rg';
  fields.email.value = existing.email || 'rgcanda777@gmail.com';
  fields.phone.value = existing.phone || '';
  fields.day.value = existing.dateOfBirth?.day || '';
  fields.month.value = existing.dateOfBirth?.month || '';
  fields.year.value = existing.dateOfBirth?.year || '';

  const setGender = (value) => {
    fields.gender.forEach((radio) => {
      radio.checked = radio.value === value;
    });
  };
  setGender(existing.gender || 'male');

  const renderAvatar = (imageSource, displayName) => {
    [accountSidebarAvatar, accountMainAvatar].forEach((avatar) => {
      if (!avatar) return;
      const image = avatar.querySelector('.account-avatar-image');
      const initial = avatar.querySelector('.account-avatar-initial');
      if (imageSource && image) {
        image.src = imageSource;
        image.hidden = false;
        if (initial) initial.hidden = true;
      } else {
        image?.removeAttribute('src');
        if (image) image.hidden = true;
        const initialText = (displayName || 'R').charAt(0).toUpperCase();
        if (initial) {
          initial.textContent = initialText;
          initial.hidden = false;
        } else {
          avatar.textContent = initialText;
        }
      }
    });
  };

  renderAvatar(existing.avatarImage, existing.username || existing.displayName);

  document.getElementById('account-email-edit')?.addEventListener('click', () => {
    fields.email.focus();
    fields.email.select();
  });

  addressForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = addressForm.querySelector('button[type="submit"]');
    const formData = new FormData(addressForm);
    const address = {
      id: formData.get('id') || undefined,
      label: formData.get('label'),
      recipient: formData.get('recipient'),
      phone: formData.get('phone'),
      street: formData.get('street'),
      city: formData.get('city'),
      postalCode: formData.get('postalCode'),
      country: formData.get('country'),
      isDefault: addressForm.elements.isDefault.checked,
    };
    addressStatus.textContent = 'Saving address...';
    submitButton.disabled = true;
    try {
      await apiRequest('/api/addresses', { method: 'POST', body: address });
      addressForm.reset();
      addressForm.elements.id.value = '';
      addressForm.elements.label.value = 'Home';
      addressForm.elements.country.value = 'Philippines';
      addressForm.elements.isDefault.checked = true;
      document.getElementById('account-address-form-title').textContent = 'Add an address';
      addressStatus.textContent = 'Address saved.';
      await renderAccountAddresses(addressList);
    } catch (error) {
      addressStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const newPassword = passwordForm.elements.newPassword.value;
    if (newPassword !== passwordForm.elements.confirmPassword.value) {
      passwordStatus.textContent = 'The new passwords do not match.';
      passwordForm.elements.confirmPassword.focus();
      return;
    }

    const submitButton = passwordForm.querySelector('button[type="submit"]');
    passwordStatus.textContent = 'Updating password...';
    submitButton.disabled = true;
    try {
      await apiRequest('/api/change-password', {
        method: 'PUT',
        body: {
          currentPassword: passwordForm.elements.currentPassword.value,
          newPassword,
        },
      });
      passwordForm.reset();
      passwordStatus.textContent = 'Password updated.';
    } catch (error) {
      passwordStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  imageSelectButton?.addEventListener('click', () => imageInput?.click());
  imageInput?.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      status.textContent = 'Choose a JPEG or PNG image.';
      imageInput.value = '';
      return;
    }

    if (file.size > 1024 * 1024) {
      status.textContent = 'The image must be 1 MB or smaller.';
      imageInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') return;
      existing.avatarImage = reader.result;
      renderAvatar(existing.avatarImage, fields.username.value.trim());
      status.textContent = 'Image selected. Save your profile to keep it.';
    });
    reader.addEventListener('error', () => {
      status.textContent = 'The image could not be opened. Choose another file.';
    });
    reader.readAsDataURL(file);
  });

  accountForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const username = fields.username.value.trim();
    const name = fields.name.value.trim();
    const email = fields.email.value.trim();
    const day = fields.day.value;
    const month = fields.month.value;
    const year = fields.year.value;
    const hasPartialDate = Boolean(day || month || year);

    if (!username || !name || !email || !fields.email.validity.valid) {
      status.textContent = 'Enter a username, name, and valid email address.';
      return;
    }

    if (hasPartialDate && !(day && month && year)) {
      status.textContent = 'Choose the date, month, and year to complete your date of birth.';
      return;
    }

    if (hasPartialDate) {
      const monthNumber = fields.month.selectedIndex;
      const daysInMonth = new Date(Number(year), monthNumber, 0).getDate();
      if (Number(day) > daysInMonth) {
        status.textContent = 'That date of birth is not valid.';
        return;
      }
    }

    const formData = {
      username,
      name,
      email,
      phone: fields.phone.value || '',
      gender: document.querySelector('input[name="gender"]:checked')?.value || 'male',
      dateOfBirth: { day, month, year },
      avatarImage: existing.avatarImage || '',
    };

    const saveButton = accountForm.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    status.textContent = 'Saving profile...';
    try {
      const response = await apiRequest('/api/profile', { method: 'PUT', body: formData });
      existing = response.account;
      currentAccount = existing;
      avatarImage = existing.avatarImage;
      if (accountUserName) accountUserName.textContent = existing.username;
      renderAvatar(existing.avatarImage, existing.username);
      updateAccountHeader();
      status.textContent = 'Profile saved.';
      saveButton.textContent = 'Saved';
      setTimeout(() => { saveButton.textContent = 'Save'; }, 1200);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      saveButton.disabled = false;
    }
  });

  addressForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = addressForm.querySelector('button[type="submit"]');
    const formData = new FormData(addressForm);
    const address = Object.fromEntries(formData.entries());
    address.isDefault = addressForm.elements.isDefault.checked;
    addressStatus.textContent = 'Saving address...';
    submitButton.disabled = true;
    try {
      await apiRequest('/api/addresses', { method: 'POST', body: address });
      addressForm.reset();
      addressForm.elements.id.value = '';
      addressForm.elements.label.value = 'Home';
      addressForm.elements.country.value = 'Philippines';
      addressForm.elements.isDefault.checked = true;
      document.getElementById('account-address-form-title').textContent = 'Add an address';
      addressStatus.textContent = 'Address saved.';
      await renderAccountAddresses(addressList);
    } catch (error) {
      addressStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const newPassword = passwordForm.elements.newPassword.value;
    if (newPassword !== passwordForm.elements.confirmPassword.value) {
      passwordStatus.textContent = 'The new passwords do not match.';
      passwordForm.elements.confirmPassword.focus();
      return;
    }

    const submitButton = passwordForm.querySelector('button[type="submit"]');
    passwordStatus.textContent = 'Updating password...';
    submitButton.disabled = true;
    try {
      await apiRequest('/api/change-password', {
        method: 'PUT',
        body: {
          currentPassword: passwordForm.elements.currentPassword.value,
          newPassword,
        },
      });
      passwordForm.reset();
      passwordStatus.textContent = 'Password updated.';
    } catch (error) {
      passwordStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
}

function getDeliveryLocation() {
  try {
    const saved = JSON.parse(localStorage.getItem(DELIVERY_LOCATION_KEY) || localStorage.getItem(LEGACY_DELIVERY_LOCATION_KEY) || 'null');
    if (saved && typeof saved.countryCode === 'string' && typeof saved.country === 'string') {
      return { ...saved, postalCode: typeof saved.postalCode === 'string' ? saved.postalCode : '' };
    }
  } catch (error) {
    return { countryCode: 'PH', country: 'Philippines', postalCode: '' };
  }
  return { countryCode: 'PH', country: 'Philippines', postalCode: '' };
}

function saveDeliveryLocation(location) {
  localStorage.setItem(DELIVERY_LOCATION_KEY, JSON.stringify(location));
  const label = location.postalCode ? `${location.country} ${location.postalCode}` : location.country;
  document.querySelectorAll('.delivery-location-label').forEach((element) => {
    element.textContent = label;
  });
}

function updateDeliveryLocationHeaders() {
  const location = getDeliveryLocation();
  const label = location.postalCode ? `${location.country} ${location.postalCode}` : location.country;
  document.querySelectorAll('.delivery-location-label').forEach((element) => {
    element.textContent = label;
  });
}

function populateDeliveryCountries(select) {
  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const countries = DELIVERY_COUNTRY_CODES
    .map((code) => ({ code, name: displayNames.of(code) }))
    .filter((country) => country.name && country.name !== country.code)
    .sort((first, second) => first.name.localeCompare(second.name));

  select.replaceChildren(...countries.map(({ code, name }) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    return option;
  }));
}

function getSupportResponse(question) {
  const message = question.toLowerCase();

  if (/order|track|tracking|purchase/.test(message)) {
    return { text: 'Demo orders are saved in this browser and appear under My Purchase in your account. They are not sent to a seller, and real delivery tracking is not available.' };
  }
  if (/return|refund|exchange/.test(message)) {
    return { text: 'Returns are only a demonstration here. Since demo checkout does not save purchases, there are no real items to return.' };
  }
  if (/deliver|delivery|shipping|ship|location|country|zip|postal/.test(message)) {
    const location = getDeliveryLocation();
    const destination = location.postalCode ? `${location.country} ${location.postalCode}` : location.country;
    return { text: `Your current demo delivery location is ${destination}. Use the Deliver to control in the header to change it.` };
  }
  if (/deal|discount|sale|today/.test(message)) {
    return {
      text: 'Browse the current demo offers in Today’s Deals. Prices and availability are examples.',
      link: { href: document.getElementById('todays-deals') ? '#todays-deals' : 'index.html#todays-deals', label: 'Browse today’s deals' },
    };
  }
  if (/new arrival|latest|new product/.test(message)) {
    return {
      text: 'Here are the latest demo products across several categories.',
      link: { href: document.getElementById('new-arrivals') ? '#new-arrivals' : 'index.html#new-arrivals', label: 'See new arrivals' },
    };
  }
  if (/cart|add to cart|account|sign in|login/.test(message)) {
    return { text: 'Adding items and checkout are demo flows. You can use the account button in the header to open the demo sign-in.' };
  }
  if (/checkout|payment|pay/.test(message)) {
    return { text: 'Checkout is for demonstration only. No order is placed and no payment is processed.' };
  }
  if (/contact|human|agent|person|help|support/.test(message)) {
    return { text: 'I’m the Northgate demo assistant. I can answer common questions here, but I’m not connected to a live support team.' };
  }
  return { text: 'I can help with demo orders, returns, delivery locations, checkout, today’s deals, and new arrivals. Which would you like to know about?' };
}

function initializeSupportAssistant() {
  document.body.insertAdjacentHTML('beforeend', `
    <button class="support-launcher" id="support-launcher" type="button" aria-expanded="false" aria-controls="support-panel">
      Ask support
    </button>
    <section class="support-panel" id="support-panel" aria-label="Northgate demo support" aria-hidden="true" hidden>
      <header class="support-header">
        <div>
          <strong>Northgate Support</strong>
          <span>DEMO ASSISTANT</span>
        </div>
        <button class="support-close" id="support-close" type="button" aria-label="Close support chat">×</button>
      </header>
      <div class="support-thread" id="support-thread" role="log" aria-live="polite" aria-relevant="additions text">
        <div class="support-message support-message-agent">
          <p>Hi! I can help with demo orders, returns, delivery locations, checkout, and finding products.</p>
        </div>
        <div class="support-topics" aria-label="Common questions">
          <button type="button" data-support-question="Where is my order?">Track an order</button>
          <button type="button" data-support-question="How do returns work?">Returns</button>
          <button type="button" data-support-question="Change my delivery location">Delivery</button>
          <button type="button" data-support-question="Show me today’s deals">Today’s deals</button>
        </div>
      </div>
      <form class="support-form" id="support-form">
        <label class="visually-hidden" for="support-input">Ask Northgate support</label>
        <input id="support-input" name="question" type="text" autocomplete="off" placeholder="Ask a question" required />
        <button type="submit" aria-label="Send message">Send</button>
      </form>
      <p class="support-disclaimer">Demo replies only. No live agent or AI service is connected.</p>
    </section>
  `);

  const launcher = document.getElementById('support-launcher');
  const panel = document.getElementById('support-panel');
  const closeButton = document.getElementById('support-close');
  const thread = document.getElementById('support-thread');
  const form = document.getElementById('support-form');
  const input = document.getElementById('support-input');

  const closePanel = () => {
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
  };

  const addMessage = (text, role, link) => {
    const message = document.createElement('div');
    message.className = `support-message support-message-${role}`;
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    message.append(paragraph);
    if (link) {
      const anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.textContent = link.label;
      message.append(anchor);
    }
    thread.append(message);
    thread.scrollTop = thread.scrollHeight;
  };

  const ask = (question) => {
    const value = question.trim();
    if (!value) return;
    addMessage(value, 'customer');
    const response = getSupportResponse(value);
    addMessage(response.text, 'agent', response.link);
  };

  const openPanel = (topic) => {
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    launcher.setAttribute('aria-expanded', 'true');
    if (topic) ask(topic);
    else input.focus();
  };

  launcher.addEventListener('click', () => openPanel());
  closeButton.addEventListener('click', closePanel);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    ask(input.value);
    form.reset();
    input.focus();
  });
  thread.querySelectorAll('[data-support-question]').forEach((button) => {
    button.addEventListener('click', () => ask(button.dataset.supportQuestion));
  });
  document.querySelectorAll('[data-support-open]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openPanel(trigger.dataset.supportTopic || '');
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) closePanel();
  });
}

function addCartProduct(product, quantity = 1) {
  const items = getCartItems();
  const productId = product.id || product.name;
  const existing = items.find((item) => String(item.id || item.name) === String(productId));
  if (existing) {
    existing.quantity = Number(existing.quantity || 1) + Number(quantity || 1);
  } else {
    items.push({
      id: productId,
      name: product.name,
      price: Number(product.price || 0),
      image: normalizeImageSource(product.image || productImageUrl(product, 700)),
      quantity: Number(quantity || 1),
    });
  }
  saveCartItems(items);
  updateCartCount();
  renderCartPage();

  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = `${product.name} added to cart`;
    toast.classList.add('show');
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => toast.classList.remove('show'), 1400);
  }
}

function renderCheckoutPreview() {
  const preview = document.getElementById('checkout-preview');
  if (!preview) return;

  const items = getCartItems();
  if (!items.length) {
    preview.innerHTML = '<p class="checkout-preview-empty">No items selected yet.</p>';
    return;
  }

  preview.innerHTML = items
    .map((item) => {
      const itemTotal = Number(item.quantity || 1) * Number(item.price || 0);
      return `
        <div class="checkout-preview-item">
          <img src="${item.image || FALLBACK_IMAGE}" alt="${item.name}" loading="lazy" />
          <div class="checkout-preview-copy">
            <strong>${item.name}</strong>
            <span>Qty ${item.quantity || 1}</span>
          </div>
          <span class="checkout-preview-price">$${itemTotal.toFixed(2)}</span>
        </div>
      `;
    })
    .join('');
}

function syncCheckoutSummary() {
  [
    ['summary-items', 'checkout-items'],
    ['summary-subtotal', 'checkout-subtotal'],
    ['summary-shipping', 'checkout-shipping'],
    ['summary-total', 'checkout-total'],
  ].forEach(([sourceId, targetId]) => {
    const source = document.getElementById(sourceId);
    const target = document.getElementById(targetId);
    if (source && target) target.textContent = source.textContent;
  });

  renderCheckoutPreview();
}

function updateCheckoutAvailability(items) {
  const checkoutButton = document.getElementById('checkout-open');
  if (!checkoutButton) return;

  const hasItems = items.length > 0;
  checkoutButton.disabled = !hasItems;
  checkoutButton.setAttribute('aria-disabled', String(!hasItems));
  checkoutButton.title = hasItems ? 'Proceed to checkout' : 'Add an item to your cart to enable checkout';
}

function updateCartCount() {
  const items = getCartItems();
  const count = items.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  document.querySelectorAll('.cart-count').forEach((badge) => {
    badge.textContent = String(count);
  });
  return count;
}

function removeCartItem(index) {
  const items = getCartItems();
  const product = items[index];

  if (!product) return;

  showRemoveConfirmation(product.name, () => {
    items.splice(index, 1);
    saveCartItems(items);
    updateCartCount();
    renderCartPage();
  });
}

function showRemoveConfirmation(productName, onConfirm) {
  const backdrop = document.getElementById('confirm-modal');
  const message = document.getElementById('confirm-message');
  const confirmButton = document.getElementById('confirm-remove');
  const cancelButton = document.getElementById('cancel-remove');

  if (!backdrop || !message || !confirmButton || !cancelButton) {
    return;
  }

  message.textContent = `Are you sure you want to remove ${productName} from your cart?`;
  const returnFocusTo = document.activeElement;

  const closeModal = () => {
    backdrop.classList.remove('show');
    backdrop.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', handleEscape);
    returnFocusTo?.focus();
  };

  const handleEscape = (event) => {
    if (event.key === 'Escape') closeModal();
  };

  cancelButton.onclick = () => closeModal();
  confirmButton.onclick = () => {
    backdrop.classList.remove('show');
    backdrop.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', handleEscape);
    onConfirm();
  };

  backdrop.onclick = (event) => {
    if (event.target === backdrop) {
      closeModal();
    }
  };

  backdrop.classList.add('show');
  backdrop.setAttribute('aria-hidden', 'false');
  document.addEventListener('keydown', handleEscape);
  requestAnimationFrame(() => cancelButton.focus());
}

function renderCartPage() {
  const container = document.getElementById('cart-items');
  if (!container) return;

  const items = getCartItems();
  updateCheckoutAvailability(items);
  if (!items.length) {
    container.innerHTML = `
      <div class="empty-cart">
        <h2>Your cart is empty</h2>
        <p>Browse the store and add a few favorites to get started.</p>
      </div>
    `;
    document.getElementById('cart-item-count').textContent = '0 items';
    document.getElementById('summary-items').textContent = '0';
    document.getElementById('summary-subtotal').textContent = '$0.00';
    document.getElementById('summary-shipping').textContent = '$0.00';
    document.getElementById('summary-total').textContent = '$0.00';
    syncCheckoutSummary();
    return;
  }

  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  const total = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  const shipping = total > 0 ? 12.99 : 0;
  const finalTotal = total + shipping;

  container.innerHTML = items
    .map(
      (item, index) => `
        <article class="cart-item" data-index="${index}">
          <img src="${item.image || 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=700&q=80'}" alt="${item.name}" />
          <div>
            <h3>${item.name}</h3>
            <div class="cart-item-meta">
              <span>In stock</span>
              <span>Free returns</span>
            </div>
            <div class="cart-item-actions">
              <div class="qty-control" aria-label="Quantity control">
                <button type="button" data-action="decrease" data-index="${index}">−</button>
                <span>${Number(item.quantity || 1)}</span>
                <button type="button" data-action="increase" data-index="${index}">+</button>
              </div>
            </div>
          </div>
          <div class="cart-item-price">$${(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)}</div>
        </article>
      `
    )
    .join('');

  document.getElementById('cart-item-count').textContent = `${totalQuantity} item${totalQuantity !== 1 ? 's' : ''}`;
  document.getElementById('summary-items').textContent = String(totalQuantity);
  document.getElementById('summary-subtotal').textContent = `$${total.toFixed(2)}`;
  document.getElementById('summary-shipping').textContent = `$${shipping.toFixed(2)}`;
  document.getElementById('summary-total').textContent = `$${finalTotal.toFixed(2)}`;
  syncCheckoutSummary();

  container.querySelectorAll('[data-action="decrease"]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const current = getCartItems()[index];
      if (!current) return;

      if ((current.quantity || 1) <= 1) {
        removeCartItem(index);
        return;
      }

      const items = getCartItems();
      items[index].quantity = Number(items[index].quantity || 1) - 1;
      saveCartItems(items);
      updateCartCount();
      renderCartPage();
    });
  });

  container.querySelectorAll('[data-action="increase"]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const items = getCartItems();
      if (!items[index]) return;
      items[index].quantity = (Number(items[index].quantity || 1) + 1);
      saveCartItems(items);
      updateCartCount();
      renderCartPage();
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const session = await apiRequest('/api/session');
    currentAccount = session.account;
  } catch (error) {
    accountAuthMode = 'firebase';
    const hostedAuth = window.northgateFirebaseAuth;
    if (hostedAuth?.ready) {
      await hostedAuth.ready;
      currentAccount = firebaseAccount(hostedAuth.currentUser);
    } else {
      currentAccount = null;
    }
  }

  const year = document.getElementById('year');
  if (year) {
    year.textContent = new Date().getFullYear();
  }

  updateCartCount();
  renderCartPage();
  renderCatalogProducts();
  renderHomepageCollections();
  renderProductDetail();
  filterCatalog();
  updateAccountHeader();
  updateDeliveryLocationHeaders();

  const locationModal = document.getElementById('location-modal');
  const locationTriggers = document.querySelectorAll('.location-trigger');
  const deliveryCountry = document.getElementById('delivery-country');
  const locationZip = document.getElementById('location-zip');
  const locationStatus = document.getElementById('location-status');

  if (locationModal && locationTriggers.length && deliveryCountry && locationZip && locationStatus) {
    populateDeliveryCountries(deliveryCountry);
    let locationReturnFocus = null;

    const closeLocationModal = () => {
      locationModal.classList.remove('show');
      locationModal.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', handleLocationEscape);
      locationReturnFocus?.focus();
    };

    const handleLocationEscape = (event) => {
      if (event.key === 'Escape' && locationModal.classList.contains('show')) closeLocationModal();
    };

    locationTriggers.forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const saved = getDeliveryLocation();
        locationReturnFocus = trigger;
        deliveryCountry.value = saved.countryCode;
        locationZip.value = saved.postalCode;
        locationStatus.textContent = '';
        locationModal.classList.add('show');
        locationModal.setAttribute('aria-hidden', 'false');
        document.addEventListener('keydown', handleLocationEscape);
        deliveryCountry.focus();
      });
    });

    const saveSelectedCountry = () => {
      const option = deliveryCountry.selectedOptions[0];
      if (!option) return;

      const postalCode = option.value === 'US' ? locationZip.value.trim() : '';
      if (postalCode && !/^\d{5}(-\d{4})?$/.test(postalCode)) {
        locationStatus.textContent = 'Enter a valid 5-digit US ZIP code, or leave it blank.';
        locationZip.focus();
        return;
      }

      saveDeliveryLocation({ countryCode: option.value, country: option.textContent, postalCode });
      closeLocationModal();
    };

    document.getElementById('location-done').addEventListener('click', saveSelectedCountry);
    document.getElementById('location-apply').addEventListener('click', () => {
      const postalCode = locationZip.value.trim();
      if (!/^\d{5}(-\d{4})?$/.test(postalCode)) {
        locationStatus.textContent = 'Enter a valid 5-digit US ZIP code or ZIP+4.';
        locationZip.focus();
        return;
      }

      deliveryCountry.value = 'US';
      const unitedStates = deliveryCountry.selectedOptions[0];
      saveDeliveryLocation({ countryCode: 'US', country: unitedStates.textContent, postalCode });
      locationStatus.textContent = `Delivery location set to ${unitedStates.textContent} ${postalCode}.`;
    });
    locationModal.querySelector('.location-close').addEventListener('click', closeLocationModal);
    locationModal.addEventListener('click', (event) => {
      if (event.target === locationModal) closeLocationModal();
    });
    document.getElementById('location-signin').addEventListener('click', () => {
      closeLocationModal();
      document.querySelector('.account-trigger')?.click();
    });
  }

  let pendingCartAddition = null;
  const addToCartOrPrompt = (product, quantity = 1) => {
    if (getDemoAccount()) {
      addCartProduct(product, quantity);
      return;
    }

    pendingCartAddition = { product, quantity };
    openLoginPopup('Sign in or create an account to add this item to your cart.');
  };

  const checkoutModal = document.getElementById('checkout-modal');
  const checkoutTrigger = document.getElementById('checkout-open');
  const checkoutForm = document.getElementById('checkout-form');

  if (checkoutModal && checkoutTrigger && checkoutForm) {
    const closeCheckout = () => {
      checkoutModal.classList.remove('show');
      checkoutModal.setAttribute('aria-hidden', 'true');
      renderCartPage();
      checkoutTrigger.focus();
    };

    checkoutTrigger.addEventListener('click', () => {
      if (!getDemoAccount()) {
        openLoginPopup('Sign in or create an account to continue to checkout.');
        return;
      }

      syncCheckoutSummary();
      checkoutModal.classList.add('show');
      checkoutModal.setAttribute('aria-hidden', 'false');
      document.getElementById('checkout-status').textContent = '';
      window.setTimeout(() => document.getElementById('checkout-name').focus(), 260);
    });

    checkoutModal.querySelector('.checkout-close').addEventListener('click', closeCheckout);
    checkoutModal.addEventListener('click', (event) => {
      if (event.target === checkoutModal) closeCheckout();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && checkoutModal.classList.contains('show')) closeCheckout();
    });

    checkoutForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = document.getElementById('checkout-status');
      const items = getCartItems();
      if (!items.length) {
        status.textContent = 'Your cart is empty. Add an item before checking out.';
        return;
      }

      const formData = new FormData(checkoutForm);
      const submitButton = checkoutForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      status.textContent = 'Placing your demo order...';
      try {
        const response = await apiRequest('/api/orders', {
          method: 'POST',
          body: {
            customerName: String(formData.get('name') || '').trim(),
            deliveryEmail: String(formData.get('email') || '').trim(),
            phone: String(formData.get('phone') || '').trim(),
            address: {
              street: String(formData.get('address') || '').trim(),
              city: String(formData.get('city') || '').trim(),
              postalCode: String(formData.get('postal') || '').trim(),
            },
            paymentMethod: String(formData.get('payment') || ''),
            items: items.map((item) => ({ id: item.id, quantity: item.quantity })),
          },
        });
        const order = response.order;
        saveCartItems([]);
        updateCartCount();
        document.getElementById('checkout-subtotal').textContent = `$${Number(order.subtotal).toFixed(2)}`;
        document.getElementById('checkout-shipping').textContent = `$${Number(order.shipping).toFixed(2)}`;
        document.getElementById('checkout-total').textContent = `$${Number(order.total).toFixed(2)}`;
        checkoutForm.hidden = true;
        document.querySelector('.checkout-intro').hidden = true;
        document.querySelector('.checkout-demo-note').hidden = true;
        document.getElementById('checkout-confirmation').hidden = false;
        document.getElementById('checkout-order-id').textContent = order.id;
        document.getElementById('checkout-summary-note').textContent = 'This saved order is managed in your Northgate account.';
        status.textContent = 'Order saved. No payment was processed.';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  const searchInput = document.querySelector('.search-bar input');
  const catalogSort = document.getElementById('catalog-sort');
  const isAccountPage = window.location.pathname.toLowerCase().endsWith('account.html');
  const isAdminPage = window.location.pathname.toLowerCase().endsWith('admin.html');

  if (isAccountPage) {
    if (!getDemoAccount()) {
      window.location.replace('index.html?signin=1');
      return;
    }
    await initializeAccountPage();
  } else if (isAdminPage) {
    await initializeAdminPage();
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      document.querySelectorAll('[data-category-filter]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === 'all'));
      });
      filterCatalog();
    });
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  if (catalogSort) {
    catalogSort.addEventListener('change', filterCatalog);
  }

  document.querySelectorAll('[data-category-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-category-filter]').forEach((filterButton) => {
        filterButton.setAttribute('aria-pressed', String(filterButton === button));
      });
      if (searchInput) searchInput.value = '';
      filterCatalog();
      document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  const loginModal = document.getElementById('login-modal');
  const loginTrigger = document.querySelector('.account-trigger');
  const loginForm = document.getElementById('login-form');
  const authModal = document.getElementById('auth-modal');
  const authForm = document.getElementById('auth-form');
  const authStatus = document.getElementById('auth-status');
  const authEmail = document.getElementById('auth-email');
  const authPassword = document.getElementById('auth-password');
  const authPasswordConfirm = document.getElementById('auth-password-confirm');
  const authName = document.getElementById('auth-name');
  const authNameField = document.getElementById('auth-name-field');
  const authConfirmField = document.getElementById('auth-confirm-field');
  const authModeToggle = document.getElementById('auth-mode-toggle');
  const authTitle = document.getElementById('auth-title');
  const authSubmitText = authForm?.querySelector('.login-submit-text');
  let authReturnFocus = null;

  const openAccountPage = () => {
    window.location.href = 'account.html';
  };

  const setAuthMode = (registering) => {
    if (!authForm) return;
    authForm.dataset.mode = registering ? 'register' : 'signin';
    authNameField.hidden = !registering;
    authName.required = registering;
    authConfirmField.hidden = !registering;
    authPasswordConfirm.required = registering;
    authPasswordConfirm.value = '';
    authPassword.autocomplete = registering ? 'new-password' : 'current-password';
    authTitle.textContent = registering ? 'Create your account' : 'Sign in to Northgate';
    authSubmitText.textContent = registering ? 'Create account' : 'Sign in';
    authModeToggle.textContent = registering ? 'I already have an account' : 'Create an account';
    authStatus.textContent = '';
    authStatus.classList.remove('success');
  };

  const openLoginPopup = (message = '') => {
    if (!authModal || !authForm) return;
    authReturnFocus = document.activeElement;
    authForm.reset();
    setAuthMode(false);
    authStatus.textContent = message;
    authModal.classList.add('show');
    authModal.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => authEmail.focus(), 100);
  };

  const closeLoginPopup = () => {
    if (!authModal) return;
    authModal.classList.remove('show');
    authModal.setAttribute('aria-hidden', 'true');
    authForm?.reset();
    authStatus.textContent = '';
    pendingCartAddition = null;
    authReturnFocus?.focus();
  };

  document.querySelectorAll('.account-trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      if (getDemoAccount()) openAccountPage();
      else openLoginPopup();
    });
  });

  document.querySelectorAll('.orders-trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      if (getDemoAccount()) openAccountPage();
      else openLoginPopup('Sign in or create an account to view your orders.');
    });
  });

  if (authModal && authForm && authStatus) {
    setAuthMode(false);

    authModeToggle.addEventListener('click', () => {
      setAuthMode(authForm.dataset.mode !== 'register');
    });

    document.getElementById('auth-close').addEventListener('click', closeLoginPopup);
    authModal.addEventListener('click', (event) => {
      if (event.target === authModal) closeLoginPopup();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && authModal.classList.contains('show')) closeLoginPopup();
    });

    authForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const registering = authForm.dataset.mode === 'register';
      const email = authEmail.value.trim().toLowerCase();

      if (registering && authPassword.value !== authPasswordConfirm.value) {
        authStatus.textContent = 'Those passwords do not match.';
        authPasswordConfirm.focus();
        return;
      }

      const submitButton = authForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      authStatus.textContent = registering ? 'Creating your account...' : 'Signing in...';
      try {
        if (accountAuthMode === 'server') {
          const response = await apiRequest(registering ? '/api/register' : '/api/login', {
            method: 'POST',
            body: {
              email,
              password: authPassword.value,
              ...(registering ? { name: authName.value.trim() } : {}),
            },
          });
          currentAccount = response.account;
        } else {
          const hostedAuth = window.northgateFirebaseAuth;
          if (!hostedAuth) {
            throw new Error('Hosted sign-in could not load. Check your connection and refresh the page.');
          }
          if (!hostedAuth.isConfigured) {
            throw new Error('Firebase is not configured yet. Follow the free setup steps in DEPLOYING.md.');
          }
          const user = registering
            ? await hostedAuth.createAccount(email, authPassword.value, authName.value.trim())
            : await hostedAuth.signIn(email, authPassword.value);
          currentAccount = firebaseAccount(user);
        }
        updateAccountHeader();
        authStatus.textContent = accountAuthMode === 'server'
          ? `Welcome, ${currentAccount.displayName}. Your account is saved on this local server.`
          : `Welcome, ${currentAccount.displayName}. You are signed in with Firebase Authentication.`;
        authStatus.classList.add('success');
        authPassword.value = '';
        authPasswordConfirm.value = '';

        if (pendingCartAddition) {
          addCartProduct(pendingCartAddition.product, pendingCartAddition.quantity);
          pendingCartAddition = null;
          authStatus.textContent += ' The item was added to your cart.';
        }
        window.setTimeout(closeLoginPopup, 1000);
      } catch (error) {
        authStatus.textContent = error.message;
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  if (new URLSearchParams(window.location.search).get('signin') === '1' && !getDemoAccount()) {
    openLoginPopup('Sign in or create an account to continue.');
  }

  if (loginModal && loginTrigger) {
    const loginNameField = document.getElementById('login-name-field');
    const signInPasswordField = document.getElementById('login-signin-password-field');
    const signInPasswordInput = document.getElementById('login-signin-password');
    const passwordFields = document.getElementById('login-password-fields');
    const nameInput = document.getElementById('login-name');
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const passwordConfirmInput = document.getElementById('login-password-confirm');
    const submitButton = loginForm.querySelector('.login-submit');
    const modeToggle = document.getElementById('login-mode-toggle');
    const signoutButton = document.getElementById('demo-signout');
    const status = document.getElementById('login-status');
    const ordersEmptyState = document.getElementById('orders-empty-state');
    const accountDetailsPanel = document.getElementById('account-details-panel');
    const loginTitle = document.getElementById('login-title');
    let signInPasswordStep = false;

    const updateSubmitButton = (text, icon = '→') => {
      submitButton.innerHTML = `
        <span class="login-submit-text">${text}</span>
        <span class="login-submit-icon" aria-hidden="true">${icon}</span>
      `;
    };

    const renderAccountDetails = () => {
      const account = getDemoAccount();
      if (!accountDetailsPanel || !account) {
        return;
      }

      const createdDate = account.createdAt ? new Date(account.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }) : 'Recently';

      const recentOrders = [
        { id: '#NW-2048', item: 'Wireless Earbuds Pro', status: 'Shipped', total: '$79.99' },
        { id: '#NW-1941', item: 'Desk Air Purifier', status: 'Delivered', total: '$64.99' },
      ];

      accountDetailsPanel.innerHTML = `
        <div class="account-dashboard-shell">
          <aside class="account-sidebar">
            <div class="account-brand-row">
              <div class="account-brand-mark">${(account.displayName || 'R').charAt(0).toUpperCase()}</div>
              <div class="account-brand-copy">
                <span>${account.displayName}</span>
                <small>Edit Profile</small>
              </div>
            </div>

            <nav class="account-sidebar-nav" aria-label="Account navigation">
              <button type="button" class="account-nav-item active">
                <span class="account-icon" aria-hidden="true">◌</span>
                <span>My Account</span>
              </button>
              <button type="button" class="account-nav-item">
                <span class="account-icon" aria-hidden="true">👤</span>
                <span>Profile</span>
              </button>
              <button type="button" class="account-nav-item">
                <span class="account-icon" aria-hidden="true">💳</span>
                <span>Banks &amp; Cards</span>
              </button>
              <button type="button" class="account-nav-item">
                <span class="account-icon" aria-hidden="true">📍</span>
                <span>Addresses</span>
              </button>
              <button type="button" class="account-nav-item">
                <span class="account-icon" aria-hidden="true">🔒</span>
                <span>Change Password</span>
              </button>
              <button type="button" class="account-nav-item">
                <span class="account-icon" aria-hidden="true">⚙️</span>
                <span>Privacy Settings</span>
              </button>
              <button type="button" class="account-nav-item">
                <span class="account-icon" aria-hidden="true">🔔</span>
                <span>Notification Settings</span>
              </button>
              <button type="button" class="account-nav-item">
                <span class="account-icon" aria-hidden="true">⚙️</span>
                <span>Order Settings</span>
              </button>
            </nav>

            <div class="account-sidebar-section">
              <button type="button" class="account-nav-item sub-item">
                <span class="account-icon" aria-hidden="true">🧾</span>
                <span>My Purchase</span>
              </button>
              <button type="button" class="account-nav-item sub-item">
                <span class="account-icon" aria-hidden="true">🔔</span>
                <span>Notifications</span>
              </button>
              <button type="button" class="account-nav-item sub-item">
                <span class="account-icon" aria-hidden="true">🎟️</span>
                <span>My Vouchers</span>
              </button>
              <button type="button" class="account-nav-item sub-item">
                <span class="account-icon" aria-hidden="true">🪙</span>
                <span>My Northgate Coins</span>
              </button>
            </div>
          </aside>

          <main class="account-main-panel">
            <div class="account-panel-row">
              <h2>Credit / Debit Card</h2>
              <button type="button" class="account-primary-action">
                <span aria-hidden="true">＋</span>
                Add New Card
              </button>
            </div>

            <div class="account-empty-state">You don't have cards yet.</div>

            <div class="account-panel-row account-panel-row-spaced">
              <h2>Northgate Savings</h2>
              <button type="button" class="account-primary-action">
                <span aria-hidden="true">＋</span>
                Link Northgate Account
              </button>
            </div>

            <div class="account-empty-state muted">You don't have a Northgate account yet</div>

            <div class="account-panel-row account-panel-row-spaced account-panel-row-last">
              <h2>My Bank Accounts</h2>
              <button type="button" class="account-primary-action">
                <span aria-hidden="true">＋</span>
                Add New Bank Account
              </button>
            </div>
          </main>
        </div>
      `;

      const editProfileButton = accountDetailsPanel.querySelector('.account-edit-profile');
      const manageAddressButton = accountDetailsPanel.querySelector('.account-manage-address');
      const viewOrdersButton = accountDetailsPanel.querySelector('.account-view-orders');

      editProfileButton?.addEventListener('click', () => {
        const account = getDemoAccount();
        const nextName = window.prompt('Update your profile name', account?.displayName || 'Member');
        if (nextName !== null) {
          saveDemoAccount(nextName.trim() || 'Member', account?.email || '', {
            phone: account?.phone || '+63 912 345 6789',
            address: account?.address || '22 Kapitan Tiago Street',
            city: account?.city || 'Quezon City',
            country: account?.country || 'Philippines',
          });
          renderAccountDetails();
        }
      });

      manageAddressButton?.addEventListener('click', () => {
        const account = getDemoAccount();
        const nextAddress = window.prompt('Update your shipping address', account?.address || '22 Kapitan Tiago Street');
        if (nextAddress !== null) {
          saveDemoAccount(account?.displayName || 'Member', account?.email || '', {
            phone: account?.phone || '+63 912 345 6789',
            address: nextAddress.trim() || account?.address || '22 Kapitan Tiago Street',
            city: account?.city || 'Quezon City',
            country: account?.country || 'Philippines',
          });
          renderAccountDetails();
        }
      });

      viewOrdersButton?.addEventListener('click', () => {
        setOrdersView(true);
      });
    };

    const setOrdersView = (enabled) => {
      loginTitle.textContent = enabled ? 'Returns & Orders' : 'Sign in or create account';
      loginForm.hidden = enabled;
      if (ordersEmptyState) ordersEmptyState.hidden = !enabled;
      loginModal.querySelector('.login-intro').hidden = enabled;
      loginModal.querySelector('.login-terms').hidden = enabled;
      loginModal.querySelector('.login-help').hidden = enabled;
      loginModal.querySelector('.login-business').hidden = enabled;
      loginModal.querySelector('.login-demo-note').hidden = enabled;

      if (accountDetailsPanel) {
        accountDetailsPanel.hidden = !enabled && !getDemoAccount();
      }
    };

    const setRegistrationMode = (enabled) => {
      loginForm.dataset.mode = enabled ? 'register' : 'signin';
      signInPasswordStep = false;
      signInPasswordField.hidden = true;
      signInPasswordInput.required = false;
      signInPasswordInput.value = '';
      loginNameField.hidden = !enabled;
      passwordFields.hidden = !enabled;
      nameInput.required = enabled;
      passwordInput.required = enabled;
      passwordConfirmInput.required = enabled;
      submitButton.disabled = false;
      updateSubmitButton(enabled ? 'Create account' : 'Continue');
      modeToggle.textContent = enabled ? 'I already have an account' : 'Create an account';
      status.textContent = '';
      status.classList.remove('success');
    };

    const closeLoginModal = () => {
      loginModal.classList.remove('show');
      loginModal.setAttribute('aria-hidden', 'true');
      setOrdersView(false);
      passwordInput.value = '';
      passwordConfirmInput.value = '';
      signInPasswordInput.value = '';
      loginTrigger.focus();
    };

    loginTrigger.addEventListener('click', () => {
      const account = getDemoAccount();
      setOrdersView(false);
      setRegistrationMode(false);
      signoutButton.hidden = !account;
      modeToggle.hidden = Boolean(account);
      submitButton.disabled = Boolean(account);
      updateSubmitButton(account ? 'Signed in' : 'Continue');
      if (account) {
        status.textContent = `Welcome back, ${account.displayName}.`;
        status.classList.add('success');
        renderAccountDetails();
        if (accountDetailsPanel) {
          accountDetailsPanel.hidden = false;
        }
        loginForm.hidden = true;
      } else {
        loginForm.hidden = false;
        if (accountDetailsPanel) accountDetailsPanel.hidden = true;
      }
      loginModal.classList.add('show');
      loginModal.setAttribute('aria-hidden', 'false');
      if (!account) document.getElementById('login-email').focus();
    });

    document.querySelectorAll('.orders-trigger').forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const account = getDemoAccount();
        loginTrigger.click();
        if (account) {
          setOrdersView(true);
        } else {
          status.textContent = 'Sign in or create an account to view your orders and returns.';
        }
      });
    });

    modeToggle.addEventListener('click', () => {
      setRegistrationMode(loginForm.dataset.mode !== 'register');
      signoutButton.hidden = true;
      if (loginForm.dataset.mode === 'register') nameInput.focus();
      else document.getElementById('login-email').focus();
    });

    signoutButton.addEventListener('click', () => {
      localStorage.removeItem(DEMO_ACCOUNT_KEY);
      updateAccountHeader();
      signoutButton.hidden = true;
      modeToggle.hidden = false;
      setRegistrationMode(false);
      if (accountDetailsPanel) accountDetailsPanel.hidden = true;
      loginForm.hidden = false;
      status.textContent = 'You are signed out of the demo account.';
    });

    loginModal.querySelector('.login-close').addEventListener('click', closeLoginModal);
    loginModal.addEventListener('click', (event) => {
      if (event.target === loginModal) closeLoginModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && loginModal.classList.contains('show')) {
        closeLoginModal();
      }
    });

    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (loginForm.dataset.mode === 'register') {
        if (passwordInput.value !== passwordConfirmInput.value) {
          status.textContent = 'Those passwords do not match. Please check both fields.';
          passwordConfirmInput.focus();
          return;
        }

        const account = saveDemoAccount(nameInput.value, emailInput.value);
        status.textContent = `Demo account created. Welcome, ${account.displayName}. Your password was not saved or sent.`;
        status.classList.add('success');
        passwordInput.value = '';
        passwordConfirmInput.value = '';
        modeToggle.hidden = true;
        signoutButton.hidden = false;
        renderAccountDetails();
        if (accountDetailsPanel) {
          accountDetailsPanel.hidden = false;
          loginForm.hidden = true;
        }
        return;
      }

      if (!signInPasswordStep) {
        signInPasswordStep = true;
        signInPasswordField.hidden = false;
        signInPasswordInput.required = true;
        updateSubmitButton('Sign in');
        status.textContent = 'Enter your password to continue. Demo passwords are not verified or stored.';
        signInPasswordInput.focus();
        return;
      }

      const account = saveDemoAccount('Member', emailInput.value || '');
      status.textContent = `Demo sign-in complete. Welcome, ${account.displayName}. Your password was not verified, saved, or sent.`;
      status.classList.add('success');
      modeToggle.hidden = true;
      signoutButton.hidden = false;
      signInPasswordInput.value = '';
      signInPasswordInput.required = false;
      signInPasswordField.hidden = true;
      submitButton.disabled = true;
      updateSubmitButton('Signed in');
      renderAccountDetails();
      if (accountDetailsPanel) {
        accountDetailsPanel.hidden = false;
        loginForm.hidden = true;
      }
    });
  }

  document.querySelectorAll('.add-cart').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.product-card');
      const title = card?.querySelector('h3')?.textContent?.trim() || 'Northgate product';
      const product = allProducts.find((item) => item.name === title);
      if (!product) {
        const toast = document.getElementById('toast');
        if (toast) {
          toast.textContent = 'This product is temporarily unavailable.';
          toast.classList.add('show');
          clearTimeout(window.toastTimer);
          window.toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
        }
        return;
      }
      addToCartOrPrompt(product);
    });
  });

  const productAddButton = document.querySelector('.product-add-cart');
  if (productAddButton) {
    productAddButton.addEventListener('click', () => {
      const product = allProducts.find((item) => item.id === productAddButton.dataset.productId);
      const quantity = Number(document.getElementById('product-quantity').value) || 1;
      if (product) addToCartOrPrompt(product, quantity);
    });
  }

  initializeSupportAssistant();
});
