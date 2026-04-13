/**
 * Fetches demographic data for a ZIP code from the US Census Bureau ACS 5-year estimates.
 * API is free, no key required for small usage.
 *
 * ACS variables used:
 *   B19013_001E = Median household income
 *   B01003_001E = Total population
 *   B01002_001E = Median age
 *   B15003_022E = Bachelor's degree (population 25+)
 *   B15003_001E = Total population 25+ (for education rate calculation)
 */

export interface DemographicData {
  zip: string;
  medianIncome: number | null;
  population: number | null;
  medianAge: number | null;
  bachelorsDegreePct: number | null;
  urbanClass: "urban" | "suburban" | "rural" | null;
  fetchedAt: string;
}

export async function fetchCensusByZip(zip: string): Promise<DemographicData | null> {
  try {
    const vars = "B19013_001E,B01003_001E,B01002_001E,B15003_022E,B15003_001E";
    const url = `https://api.census.gov/data/2022/acs/acs5?get=${vars}&for=zip+code+tabulation+area:${zip}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length < 2) return null;

    const [headers, values] = [data[0] as string[], data[1] as string[]];
    const get = (key: string): number | null => {
      const i = headers.indexOf(key);
      return i >= 0 ? parseInt(values[i]) : null;
    };

    const income = get("B19013_001E");
    const pop = get("B01003_001E");
    const age = get("B01002_001E");
    const bachelors = get("B15003_022E");
    const totalAdults = get("B15003_001E");

    // Classify urban/suburban/rural by population
    const urbanClass: DemographicData["urbanClass"] =
      pop == null ? null
      : pop > 50000 ? "urban"
      : pop > 10000 ? "suburban"
      : "rural";

    return {
      zip,
      medianIncome: income && income > 0 ? income : null,
      population: pop && pop > 0 ? pop : null,
      medianAge: age && age > 0 ? age : null,
      bachelorsDegreePct:
        bachelors != null && totalAdults != null && totalAdults > 0
          ? Math.round((bachelors / totalAdults) * 100)
          : null,
      urbanClass,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
