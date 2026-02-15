export interface Park {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
}

export interface ParkPathPrefix {
  id: string;
  park_id: string;
  path_prefix: string;
  is_active: boolean;
}

export interface Attraction {
  id: string;
  park_id: string;
  slug: string;
  name: string;
  is_active: boolean;
}

export interface ParkCamera {
  id: string;
  park_id: string;
  customer_code: string;
  camera_name: string | null;
  attraction_id: string | null;
  is_active: boolean;
}
