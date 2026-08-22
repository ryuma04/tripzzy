import { apiClient } from "@/lib/api";
import { resolvePlaceImageUrl } from "@/lib/place-images";
import type { Destination } from "@/types";

export interface PlaceSuggestion {
  description: string;
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
  types?: string[];
}

export interface PlaceDetails {
  id: string;
  displayName: { text: string; languageCode?: string };
  formattedAddress: string;
  location?: { latitude: number; longitude: number };
  photos?: { name: string }[];
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  regularOpeningHours?: { weekdayDescriptions: string[] };
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
}

export const placesService = {
  autocomplete: async (query: string, country: string = "in") => {
    return apiClient.get<{ predictions: PlaceSuggestion[] }>(
      `/places/autocomplete?query=${encodeURIComponent(query)}&country=${encodeURIComponent(country)}`
    );
  },

  search: async (query: string, type?: string) => {
    let url = `/places/search?query=${encodeURIComponent(query)}`;
    if (type && type !== "all") url += `&type=${encodeURIComponent(type)}`;
    return apiClient.get<{ places: PlaceDetails[] }>(url);
  },

  getDetails: async (placeId: string) => {
    return apiClient.get<PlaceDetails>(`/places/${placeId}`);
  },

  getPhotoUrl: (place: { displayName?: { text: string }; formattedAddress?: string; photos?: { name: string }[]; image_url?: string }) => {
    return resolvePlaceImageUrl(
      place.displayName?.text || place.formattedAddress,
      place.photos,
      place.image_url
    );
  },

  saveAsDestination: async (place: PlaceDetails): Promise<Destination> => {
    const name = place.displayName?.text || place.formattedAddress?.split(",")[0] || "Destination";
    const addressParts = (place.formattedAddress || "").split(",").map((s) => s.trim());
    const country = addressParts.length > 0 ? addressParts[addressParts.length - 1] : "India";
    const region = addressParts.length > 1 ? addressParts[addressParts.length - 2] : "India";
    const photoUrl = resolvePlaceImageUrl(name, place.photos);

    const payload = {
      name: name,
      country: country || "India",
      region: region,
      description: place.formattedAddress,
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
      image_url: photoUrl,
    };

    const res = await apiClient.post<Destination>("/destinations/from-place", payload);
    if (res.success && res.data) {
      return res.data;
    }
    // Fallback object if backend response format differs
    return {
      id: (res.data as any)?.id || place.id,
      name: name,
      city: name,
      country: country,
      region: region,
      description: place.formattedAddress,
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
      image_url: photoUrl,
    };
  },
};
