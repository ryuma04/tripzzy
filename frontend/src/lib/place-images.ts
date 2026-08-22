// ═══════════════════════════════════════════
// TRIPZYY — Real Place Image Resolver & Fallback System
// Provides high-definition real photos for Indian landmarks, cities,
// Google Places photos, and resilient fallbacks.
// ═══════════════════════════════════════════

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// High-definition curated photography database for major Indian tourist landmarks and destinations
export const CURATED_INDIAN_PLACE_IMAGES: Record<string, string> = {
  // Mumbai
  "marine drive": "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=1000&auto=format&fit=crop&q=85",
  "gateway of india": "https://images.unsplash.com/photo-1587474260584-136574528ed5?w=1000&auto=format&fit=crop&q=85",
  "mumbai": "https://images.unsplash.com/photo-1566552881560-0be862a7c445?w=1000&auto=format&fit=crop&q=85",
  "bandra": "https://images.unsplash.com/photo-1595658658481-d53d3f999875?w=1000&auto=format&fit=crop&q=85",
  "elephanta caves": "https://images.unsplash.com/photo-1600100397608-f010f4448555?w=1000&auto=format&fit=crop&q=85",
  "chhatrapati shivaji": "https://images.unsplash.com/photo-1567157577867-05ccb1388e66?w=1000&auto=format&fit=crop&q=85",

  // Agra & Taj Mahal
  "taj mahal": "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&auto=format&fit=crop&q=85",
  "agra": "https://images.unsplash.com/photo-1548013146-72479768bada?w=1000&auto=format&fit=crop&q=85",
  "agra fort": "https://images.unsplash.com/photo-1598324789736-4861f89564a0?w=1000&auto=format&fit=crop&q=85",
  "fatehpur sikri": "https://images.unsplash.com/photo-1608958435020-e8a7109ba809?w=1000&auto=format&fit=crop&q=85",

  // Delhi
  "india gate": "https://images.unsplash.com/photo-1585136917195-21d91a9df7c9?w=1000&auto=format&fit=crop&q=85",
  "delhi": "https://images.unsplash.com/photo-1587474260584-136574528ed5?w=1000&auto=format&fit=crop&q=85",
  "red fort": "https://images.unsplash.com/photo-1592635196078-9fdc757f27f4?w=1000&auto=format&fit=crop&q=85",
  "qutub minar": "https://images.unsplash.com/photo-1580837119756-563d608dd119?w=1000&auto=format&fit=crop&q=85",
  "lotus temple": "https://images.unsplash.com/photo-1597040663342-45b6af3d91a8?w=1000&auto=format&fit=crop&q=85",
  "humayun": "https://images.unsplash.com/photo-1608958435020-e8a7109ba809?w=1000&auto=format&fit=crop&q=85",

  // Goa
  "baga beach": "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=1000&auto=format&fit=crop&q=85",
  "goa": "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=1000&auto=format&fit=crop&q=85",
  "calangute": "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1000&auto=format&fit=crop&q=85",
  "anjuna": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1000&auto=format&fit=crop&q=85",
  "panaji": "https://images.unsplash.com/photo-1614082242765-7c98ca0f3df3?w=1000&auto=format&fit=crop&q=85",
  "dudhsagar": "https://images.unsplash.com/photo-1582650625119-3a31f8418b7d?w=1000&auto=format&fit=crop&q=85",

  // Karnataka / Mysuru / Bengaluru / Gokarna
  "mysore palace": "https://images.unsplash.com/photo-1600100397803-0c46cf617f69?w=1000&auto=format&fit=crop&q=85",
  "mysuru": "https://images.unsplash.com/photo-1600100397803-0c46cf617f69?w=1000&auto=format&fit=crop&q=85",
  "lalbagh": "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=1000&auto=format&fit=crop&q=85",
  "bengaluru": "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=1000&auto=format&fit=crop&q=85",
  "bangalore": "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=1000&auto=format&fit=crop&q=85",
  "gokarna": "https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=1000&auto=format&fit=crop&q=85",
  "om beach": "https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=1000&auto=format&fit=crop&q=85",
  "hampi": "https://images.unsplash.com/photo-1600100397864-4e201b131804?w=1000&auto=format&fit=crop&q=85",
  "coorg": "https://images.unsplash.com/photo-1582650625119-3a31f8418b7d?w=1000&auto=format&fit=crop&q=85",

  // Rajasthan / Jaipur / Udaipur / Jodhpur
  "jaipur": "https://images.unsplash.com/photo-1599661046289-e31897846e41?w=1000&auto=format&fit=crop&q=85",
  "hawa mahal": "https://images.unsplash.com/photo-1599661046289-e31897846e41?w=1000&auto=format&fit=crop&q=85",
  "amber fort": "https://images.unsplash.com/photo-1603258849040-756d11b33230?w=1000&auto=format&fit=crop&q=85",
  "udaipur": "https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?w=1000&auto=format&fit=crop&q=85",
  "city palace": "https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?w=1000&auto=format&fit=crop&q=85",
  "jodhpur": "https://images.unsplash.com/photo-1586861635167-e5223aadc9fe?w=1000&auto=format&fit=crop&q=85",
  "jaisalmer": "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?w=1000&auto=format&fit=crop&q=85",

  // Himachal / Uttarakhand / Mountains
  "manali": "https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=1000&auto=format&fit=crop&q=85",
  "shimla": "https://images.unsplash.com/photo-1597074866923-dc0589150358?w=1000&auto=format&fit=crop&q=85",
  "solang valley": "https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=1000&auto=format&fit=crop&q=85",
  "rohtang": "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1000&auto=format&fit=crop&q=85",
  "rishikesh": "https://images.unsplash.com/photo-1605649487212-47bdab064df8?w=1000&auto=format&fit=crop&q=85",
  "haridwar": "https://images.unsplash.com/photo-1591768575198-88dac53fbd0a?w=1000&auto=format&fit=crop&q=85",
  "nainital": "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=1000&auto=format&fit=crop&q=85",
  "ladakh": "https://images.unsplash.com/photo-1581793745862-99fde7fa73d2?w=1000&auto=format&fit=crop&q=85",
  "leh": "https://images.unsplash.com/photo-1581793745862-99fde7fa73d2?w=1000&auto=format&fit=crop&q=85",

  // Uttar Pradesh / Varanasi
  "varanasi": "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=1000&auto=format&fit=crop&q=85",
  "ghats": "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=1000&auto=format&fit=crop&q=85",
  "kashi": "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=1000&auto=format&fit=crop&q=85",

  // Kerala & South India
  "kerala": "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=1000&auto=format&fit=crop&q=85",
  "munnar": "https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=1000&auto=format&fit=crop&q=85",
  "alleppey": "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=1000&auto=format&fit=crop&q=85",
  "kochi": "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?w=1000&auto=format&fit=crop&q=85",
  "chennai": "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=1000&auto=format&fit=crop&q=85",
  "hyderabad": "https://images.unsplash.com/photo-1605809736854-9457636e2f1e?w=1000&auto=format&fit=crop&q=85",
  "charminar": "https://images.unsplash.com/photo-1605809736854-9457636e2f1e?w=1000&auto=format&fit=crop&q=85",
  "pondicherry": "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=1000&auto=format&fit=crop&q=85",
  "ooty": "https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=1000&auto=format&fit=crop&q=85",

  // East & West
  "kolkata": "https://images.unsplash.com/photo-1558431382-27e303142255?w=1000&auto=format&fit=crop&q=85",
  "victoria memorial": "https://images.unsplash.com/photo-1558431382-27e303142255?w=1000&auto=format&fit=crop&q=85",
  "darjeeling": "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=1000&auto=format&fit=crop&q=85",
  "amritsar": "https://images.unsplash.com/photo-1596707328906-81e05a5dc9dc?w=1000&auto=format&fit=crop&q=85",
  "golden temple": "https://images.unsplash.com/photo-1596707328906-81e05a5dc9dc?w=1000&auto=format&fit=crop&q=85",
  "pune": "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=1000&auto=format&fit=crop&q=85",
  "shillong": "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=1000&auto=format&fit=crop&q=85",
};

/**
 * Returns a high-definition real image for any place query, Google Place object, or destination name.
 */
export function resolvePlaceImageUrl(
  placeNameOrQuery?: string,
  photos?: { name: string }[],
  existingImageUrl?: string | null
): string {
  // 1. If an existing valid image URL is provided (not empty)
  if (existingImageUrl && existingImageUrl.startsWith("http")) {
    return existingImageUrl;
  }

  // 2. If Google Place photo resource is available, use backend photo proxy
  if (photos && photos.length > 0 && photos[0]?.name) {
    return `${API_BASE}/places/photo?name=${encodeURIComponent(photos[0].name)}&max_height=600&max_width=800`;
  }

  // 3. Match against curated Indian landmarks & destinations dictionary
  if (placeNameOrQuery) {
    const q = placeNameOrQuery.toLowerCase().trim();

    for (const [key, url] of Object.entries(CURATED_INDIAN_PLACE_IMAGES)) {
      if (q.includes(key) || key.includes(q)) {
        return url;
      }
    }

    // Try token matching
    const tokens = q.split(/[\s,–—\-]+/);
    for (const token of tokens) {
      if (token.length >= 4 && CURATED_INDIAN_PLACE_IMAGES[token]) {
        return CURATED_INDIAN_PLACE_IMAGES[token];
      }
    }
  }

  // 4. Default high-definition aesthetic Indian travel backdrop
  return "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1000&auto=format&fit=crop&q=85";
}
