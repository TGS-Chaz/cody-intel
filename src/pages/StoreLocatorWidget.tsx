import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

interface Store {
  id: string;
  company: string;
  city: string | null;
  address: string | null;
  website: string | null;
}

export default function StoreLocatorWidget() {
  const params = new URLSearchParams(window.location.search);
  const brandSlug = params.get("brand") ?? "";
  const cityParam = params.get("city") ?? "";
  const theme = params.get("theme") ?? "light";

  const [brandName, setBrandName] = useState<string>("");
  const [stores, setStores] = useState<Store[]>([]);
  const [cityFilter, setCityFilter] = useState<string>(cityParam);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!brandSlug) {
      setError("No brand specified.");
      setLoading(false);
      return;
    }

    async function fetchStores() {
      setLoading(true);
      setError(null);

      // 1. Find the brand
      const { data: brandData, error: brandErr } = await supabase
        .from("market_brands")
        .select("id, name")
        .ilike("name", `%${brandSlug.replace(/-/g, " ")}%`)
        .limit(1)
        .maybeSingle();

      if (brandErr || !brandData) {
        setError("Brand not found.");
        setLoading(false);
        return;
      }

      setBrandName(brandData.name);

      // 2. Get menu items for that brand
      const { data: items, error: itemsErr } = await supabase
        .from("menu_items")
        .select("dispensary_id")
        .eq("normalized_brand_id", brandData.id)
        .eq("is_on_menu", true)
        .limit(500);

      if (itemsErr || !items || items.length === 0) {
        setStores([]);
        setLoading(false);
        return;
      }

      const storeIds = [...new Set(items.map((i: { dispensary_id: string }) => i.dispensary_id))];

      // 3. Get store details
      const { data: contacts, error: contactsErr } = await supabase
        .from("contacts")
        .select("id, company, city, address, website")
        .in("id", storeIds)
        .eq("contact_type", "dispensary");

      if (contactsErr) {
        setError("Failed to load stores.");
        setLoading(false);
        return;
      }

      setStores((contacts ?? []) as Store[]);
      setLoading(false);
    }

    fetchStores();
  }, [brandSlug]);

  const cities = [...new Set(stores.map((s) => s.city).filter(Boolean) as string[])].sort();

  const filtered = cityFilter
    ? stores.filter((s) => s.city === cityFilter)
    : stores;

  const isDark = theme === "dark";

  const colors = {
    bg: isDark ? "#111" : "#fff",
    text: isDark ? "#f0f0f0" : "#111",
    sub: isDark ? "#aaa" : "#555",
    muted: isDark ? "#666" : "#999",
    border: isDark ? "#333" : "#e5e7eb",
    accent: "#00D4AA",
    rowBg: isDark ? "#1a1a1a" : "#f9fafb",
    rowBorder: isDark ? "#2a2a2a" : "#f0f0f0",
  };

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 420,
        margin: "0 auto",
        padding: "16px",
        background: colors.bg,
        color: colors.text,
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: `2px solid ${colors.accent}`,
          paddingBottom: 12,
          marginBottom: 16,
        }}
      >
        <h2
          style={{
            margin: "0 0 10px 0",
            fontSize: 18,
            fontWeight: 700,
            color: colors.text,
            lineHeight: 1.2,
          }}
        >
          {brandName ? `Find ${brandName} near you` : "Store Locator"}
        </h2>

        {/* City filter */}
        {cities.length > 1 && (
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            style={{
              fontSize: 13,
              padding: "5px 8px",
              borderRadius: 6,
              border: `1px solid ${colors.border}`,
              background: colors.bg,
              color: colors.text,
              cursor: "pointer",
              width: "100%",
            }}
          >
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content */}
      {loading && (
        <div style={{ textAlign: "center", padding: "32px 0", color: colors.sub, fontSize: 14 }}>
          Loading stores...
        </div>
      )}

      {!loading && error && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#ef4444", fontSize: 14 }}>
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: colors.sub, fontSize: 14 }}>
          No stores found{cityFilter ? ` in ${cityFilter}` : ""}.
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((store) => (
            <div
              key={store.id}
              style={{
                background: colors.rowBg,
                border: `1px solid ${colors.rowBorder}`,
                borderRadius: 8,
                padding: "10px 12px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: colors.text,
                    marginBottom: 2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {store.company}
                </div>
                {store.city && (
                  <div style={{ fontSize: 12, color: colors.sub }}>
                    {store.city}
                    {store.address ? ` — ${store.address}` : ""}
                  </div>
                )}
              </div>

              {store.website && (
                <a
                  href={store.website.startsWith("http") ? store.website : `https://${store.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Visit website"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: `${colors.accent}18`,
                    color: colors.accent,
                    flexShrink: 0,
                    textDecoration: "none",
                    fontSize: 14,
                  }}
                >
                  ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          fontSize: 11,
          color: colors.muted,
          marginTop: 20,
          textAlign: "center",
          paddingTop: 12,
          borderTop: `1px solid ${colors.border}`,
        }}
      >
        Powered by{" "}
        <span style={{ color: colors.accent, fontWeight: 600 }}>Cody Intel</span>
      </div>
    </div>
  );
}
