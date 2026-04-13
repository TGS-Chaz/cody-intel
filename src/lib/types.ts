export interface IntelStore {
  id: string;
  lcb_license_id: string | null;
  name: string;
  trade_name: string | null;
  business_name: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  dutchie_slug: string | null;
  dutchie_dispensary_id: string | null;
  leafly_slug: string | null;
  leafly_dispensary_id: string | null;
  weedmaps_slug: string | null;
  posabit_feed_key: string | null;
  posabit_merchant: string | null;
  posabit_venue: string | null;
  jane_store_id: number | null;
  status: string | null;
  online_ordering_platform: string | null;
  menu_last_updated: string | null;
  total_products: number;
  crm_contact_id: string | null;
  org_id: string | null;
  created_at: string;
  updated_at: string;
  notes: string | null;
  demographic_data: Record<string, unknown> | null;
}

export interface DispensaryMenu {
  id: string;
  dispensary_id: string;
  intel_store_id: string | null;
  source: string;
  source_url: string | null;
  last_scraped_at: string | null;
  menu_item_count: number | null;
}
