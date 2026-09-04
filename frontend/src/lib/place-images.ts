// ═══════════════════════════════════════════
// TRIPZYY — Real Place Image Resolver & Fallback System
//
// Two maps, deliberately separate:
//
//   CURATED_INDIAN_PLACE_IMAGES — landmark-level keys ("taj mahal",
//   "golden temple"), used when an *activity* needs a picture.
//
//   DESTINATION_IMAGES — one photo per destination in the catalogue,
//   resolved from the Wikipedia article for that exact place and checked to
//   be a photograph rather than a locator map, flag or crest. This exists
//   because the curated map only ever covered India, so every foreign
//   destination — Paris, Bali, Tokyo, New York — fell through to a single
//   generic mountain-lake stock photo, and all of them looked identical.
//
// Where a city's own article leads with a map or a flag, the photo comes
// from a named landmark inside that city (noted inline). It is still a real
// photograph of that destination; nothing here is a stand-in from elsewhere.
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

export const DESTINATION_IMAGES: Record<string, string> = {
  "agra":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Taj_Mahal%2C_Agra%2C_India.jpg/1280px-Taj_Mahal%2C_Agra%2C_India.jpg",
  "ahmedabad":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Sabarmati_riverside.jpg/1280px-Sabarmati_riverside.jpg",
  "alleppey":  // Alappuzha
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Alappuzha_Boat_Beauty_W.jpg/1280px-Alappuzha_Boat_Beauty_W.jpg",
  "amritsar":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Golden_Temple_Amritsar_Gurudwara_%28cropped%29.jpg/1280px-Golden_Temple_Amritsar_Gurudwara_%28cropped%29.jpg",
  "bali":  // Tanah Lot
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/TanahLot_2014.JPG/1280px-TanahLot_2014.JPG",
  "bangkok":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/4Y1A1159_Bangkok_%2833536795515%29.jpg/1280px-4Y1A1159_Bangkok_%2833536795515%29.jpg",
  "bengaluru":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/View_from_Visvesvaraya_Industrial_and_Technological_Museum_%282025%29_02.jpg/1280px-View_from_Visvesvaraya_Industrial_and_Technological_Museum_%282025%29_02.jpg",
  "chennai":
    "https://upload.wikimedia.org/wikipedia/commons/3/32/Chennai_Central.jpg",
  "chennai international airport":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Chennai_airport_view_3.jpeg/1280px-Chennai_airport_view_3.jpeg",
  "colombo":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Colombo_city_skyline_at_night.png/1280px-Colombo_city_skyline_at_night.png",
  "coorg":  // Kodagu district
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Tadiandamol_Valley%2C_Western_Ghats.jpg/1280px-Tadiandamol_Valley%2C_Western_Ghats.jpg",
  "darjeeling":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/DarjeelingTrainFruitshop_%282%29.jpg/1280px-DarjeelingTrainFruitshop_%282%29.jpg",
  "delhi":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Jama_Masjid_2011.jpg/1280px-Jama_Masjid_2011.jpg",
  "dubai":
    "https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/1280px-Burj_Khalifa_2021.jpg",
  "goa":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/BeachFun.jpg/1280px-BeachFun.jpg",
  "gokarna":  // Gokarna, Karnataka
    "https://upload.wikimedia.org/wikipedia/commons/d/dd/Delight_india.jpg",
  "gujarat":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Rani_ki_vav_02.jpg/1280px-Rani_ki_vav_02.jpg",
  "hampi":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Wide_angle_of_Galigopuram_of_Virupaksha_Temple%2C_Hampi_%2804%29_%28cropped%29.jpg/1280px-Wide_angle_of_Galigopuram_of_Virupaksha_Temple%2C_Hampi_%2804%29_%28cropped%29.jpg",
  "istanbul":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Historical_peninsula_and_modern_skyline_of_Istanbul.jpg/1280px-Historical_peninsula_and_modern_skyline_of_Istanbul.jpg",
  "jaipur":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/East_facade_Hawa_Mahal_Jaipur_from_ground_level_%28July_2022%29_-_img_01.jpg/1280px-East_facade_Hawa_Mahal_Jaipur_from_ground_level_%28July_2022%29_-_img_01.jpg",
  "jaisalmer":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Jaisalmer_Fort.jpg/1280px-Jaisalmer_Fort.jpg",
  "kathmandu":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Kathmandu-Durbar_Square-06-Mahavishnu-Kuh-Vishnu-Pratapamalla-Jagannath-2007-gje.jpg/1280px-Kathmandu-Durbar_Square-06-Mahavishnu-Kuh-Vishnu-Pratapamalla-Jagannath-2007-gje.jpg",
  "kerala":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Boathouse_%287063399547%29.jpg/1280px-Boathouse_%287063399547%29.jpg",
  "kochi":
    "https://upload.wikimedia.org/wikipedia/commons/8/8f/Kochi_Skyline.jpg",
  "kokapet":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/ORR_view_from_Narasinghi_flyover_%2802%29.jpg/1280px-ORR_view_from_Narasinghi_flyover_%2802%29.jpg",
  "kolkata":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Kolkata_maidan.jpg/1280px-Kolkata_maidan.jpg",
  "kurla":
    "https://upload.wikimedia.org/wikipedia/commons/8/86/Kurla_christian_village.jpg",
  "leh":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Leh_City_seen_from_Shanti_Stupa.JPG/1280px-Leh_City_seen_from_Shanti_Stupa.JPG",
  "london":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/1280px-London_Skyline_%28125508655%29.jpeg",
  "manali":  // Manali, Himachal Pradesh
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Manali_City.jpg/1280px-Manali_City.jpg",
  "marine drive promenade":  // Marine Drive, Mumbai
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Mumbai_03-2016_27_skyline_at_Marine_Drive.jpg/1280px-Mumbai_03-2016_27_skyline_at_Marine_Drive.jpg",
  "mumbai":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Mumbai_Bandra-Worli_Sea_Link.jpg/1280px-Mumbai_Bandra-Worli_Sea_Link.jpg",
  "mumbai suburban":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/ICICI_Towers%2C_BKC_%28289443859%29.jpg/1280px-ICICI_Towers%2C_BKC_%28289443859%29.jpg",
  "munnar":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Munnar_Overview.jpg/1280px-Munnar_Overview.jpg",
  "new york":  // New York City
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg/1280px-View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg",
  "paris":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg/1280px-La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg",
  "pondicherry":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Pondicherry-Rock_beach_aerial_view.jpg/1280px-Pondicherry-Rock_beach_aerial_view.jpg",
  "ratnagiri":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Thibaw_Palace_in_Ratnagiri_02.jpg/1280px-Thibaw_Palace_in_Ratnagiri_02.jpg",
  "rishikesh":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Trayambakeshwar_Temple_VK.jpg/1280px-Trayambakeshwar_Temple_VK.jpg",
  "rome":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg/1280px-Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg",
  "shillong":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Elephant_Falls_II%2C_Shillong.jpg/1280px-Elephant_Falls_II%2C_Shillong.jpg",
  "shimla":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Landscape_of_Shimla_%2C_Himachal_Pradesh.jpg/1280px-Landscape_of_Shimla_%2C_Himachal_Pradesh.jpg",
  "singapore":  // Marina Bay Sands
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Marina_Bay_Sands_%28I%29.jpg/1280px-Marina_Bay_Sands_%28I%29.jpg",
  "tamil nadu":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Mamallapuram_view.jpg/1280px-Mamallapuram_view.jpg",
  "tokyo":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Skyscrapers_of_Shinjuku_2009_January.jpg/1280px-Skyscrapers_of_Shinjuku_2009_January.jpg",
  "udaipur":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Evening_view%2C_City_Palace%2C_Udaipur.jpg/1280px-Evening_view%2C_City_Palace%2C_Udaipur.jpg",
  "udupi":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Udupi_Krishna_Temple.jpg/1280px-Udupi_Krishna_Temple.jpg",
  "varanasi":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Varanasi%2C_India%2C_Ghats%2C_Cremation_ceremony_in_progress.jpg/1280px-Varanasi%2C_India%2C_Ghats%2C_Cremation_ceremony_in_progress.jpg",
};

/**
 * Returns a high-definition real image for any place query, Google Place object, or destination name.
 */
/** The generic backdrop used when a place is genuinely unknown. */
const GENERIC_FALLBACK =
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1000&auto=format&fit=crop&q=85";

/** This same placeholder got saved into `destinations.image_url` for several
 *  rows, where it would otherwise outrank a real photo of the place. */
const GENERIC_PHOTO_ID = "photo-1506744038136";

export function resolvePlaceImageUrl(
  placeNameOrQuery?: string,
  photos?: { name: string }[],
  existingImageUrl?: string | null
): string {
  // 1. A stored image wins -- unless what was stored is the placeholder, in
  //    which case it is not an image of anywhere and must not beat a real one.
  if (
    existingImageUrl &&
    existingImageUrl.startsWith("http") &&
    !existingImageUrl.includes(GENERIC_PHOTO_ID)
  ) {
    return existingImageUrl;
  }

  // 2. If Google Place photo resource is available, use backend photo proxy
  if (photos && photos.length > 0 && photos[0]?.name) {
    return `${API_BASE}/places/photo?name=${encodeURIComponent(photos[0].name)}&max_height=600&max_width=800`;
  }

  // 3. Match against the known places.
  //
  // Exact first, then the *longest* matching key -- the old version returned
  // whichever key happened to be declared first, so a short one could hijack
  // a more specific place ("marine drive" winning over "marine drive
  // promenade" purely by insertion order).
  if (placeNameOrQuery) {
    const q = placeNameOrQuery.toLowerCase().trim();

    // Destination photos are checked before landmark art: asking for "Agra"
    // should give Agra, not whichever landmark key matched first.
    const tables = [DESTINATION_IMAGES, CURATED_INDIAN_PLACE_IMAGES];

    for (const table of tables) {
      if (table[q]) return table[q];
    }

    for (const table of tables) {
      let best: string | null = null;
      let bestLen = 0;
      for (const [key, url] of Object.entries(table)) {
        if (key.length > bestLen && (q.includes(key) || key.includes(q))) {
          best = url;
          bestLen = key.length;
        }
      }
      if (best) return best;
    }

    // Token matching, longest token first for the same reason.
    const tokens = q
      .split(/[\s,–—\-]+/)
      .filter((t) => t.length >= 4)
      .sort((a, b) => b.length - a.length);
    for (const token of tokens) {
      for (const table of tables) {
        if (table[token]) return table[token];
      }
    }
  }

  // 4. Nothing known about this place. A generic travel backdrop is honest
  //    here in a way a photo of somewhere else would not be.
  return GENERIC_FALLBACK;
}
