import { graphGet } from '../../utils/instagram-api';
import { parseLocationId } from './advanced-settings';

export type InstagramLocation = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  street: string | null;
  verified: boolean;
};

export type LocationSearchResult = {
  items: InstagramLocation[];
  /** True when Meta refused the search; the user can still paste an ID or link. */
  unavailable: boolean;
  message: string | null;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: LocationSearchResult }>();

export const UNAVAILABLE_MESSAGE = 'A Meta não liberou a busca de locais para este app (requer o recurso "Page Public Metadata Access"). '
  + 'Você ainda pode colar o ID ou o link da Página do Facebook do local.';

const toLocation = (page: any): InstagramLocation | null => {
  if (!page?.id || !page?.location) return null;
  const location = page.location || {};
  return {
    id: String(page.id),
    name: String(page.name || 'Local'),
    city: location.city || null,
    state: location.state || null,
    country: location.country || null,
    street: location.street || null,
    verified: ['blue_verified', 'gray_verified'].includes(page.verification_status),
  };
};

const FIELDS = 'id,name,location{city,state,country,street},verification_status';

export const clearLocationCache = () => cache.clear();

export const searchInstagramLocations = async (token: string, query: string): Promise<LocationSearchResult> => {
  const key = query.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value: LocationSearchResult;
  const directId = parseLocationId(query);
  try {
    if (directId) {
      const page = await graphGet(`/${directId}`, token, { fields: FIELDS });
      const location = toLocation(page);
      value = location
        ? { items: [location], unavailable: false, message: null }
        : { items: [], unavailable: false, message: 'Essa Página do Facebook não tem endereço cadastrado, então o Instagram não aceita como localização.' };
    } else {
      const response = await graphGet('/pages/search', token, { q: query, fields: FIELDS, limit: 25 });
      const items = Array.isArray(response?.data)
        ? response.data.map(toLocation).filter((item: InstagramLocation | null): item is InstagramLocation => Boolean(item))
        : [];
      value = { items, unavailable: false, message: items.length ? null : 'Nenhum local encontrado. Tente outro nome ou cole o link da Página do local.' };
    }
  } catch {
    // Not cached: access may be granted later, and never surfaced as 401.
    return { items: [], unavailable: true, message: UNAVAILABLE_MESSAGE };
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
};
