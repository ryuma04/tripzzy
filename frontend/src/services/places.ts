import { apiClient } from "@/lib/api";

export interface PlaceSuggestion {
  description: string;
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

export interface PlaceDetails {
  id: string;
  displayName: { text: string };
  formattedAddress: string;
  photos?: { name: string }[];
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  regularOpeningHours?: { weekdayDescriptions: string[] };
  internationalPhoneNumber?: string;
  websiteUri?: string;
}

export const placesService = {
  autocomplete: async (query: string) => {
    return apiClient.get<{ predictions: PlaceSuggestion[] }>(`/places/autocomplete?query=${encodeURIComponent(query)}`);
  },

  search: async (query: string, type?: string) => {
    let url = `/places/search?query=${encodeURIComponent(query)}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;
    return apiClient.get<{ places: PlaceDetails[] }>(url);
  },

  getDetails: async (placeId: string) => {
    return apiClient.get<PlaceDetails>(`/places/${placeId}`);
  }
};
