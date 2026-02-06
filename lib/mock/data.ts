// Mock property, locality, and seller data for demo flow

export type BHKType = 2 | 3;
export type PropertyType = "apartment" | "independent_house" | "villa";

export interface Property {
  id: string;
  title: string;
  image: string;
  price: number;
  builtUpArea: number;
  sellerName: string;
  bhkType: BHKType;
  propertyType: PropertyType;
}

export interface Seller {
  id: string;
  name: string;
  image: string;
  phone: string;
}

export interface LocalityInfo {
  id: string;
  name: string;
  city: string;
  image: string;
  description: string;
  highlights: string[];
  pros: string[];
  cons: string[];
  priceTrend: number; // % change in last 1 year, e.g. 5.2 = +5.2%
}

export const MOCK_PROPERTIES: Property[] = [
  {
    id: "p1",
    title: "2BHK · 80L",
    image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400",
    price: 80_00_000,
    builtUpArea: 1200,
    sellerName: "Nadeem",
    bhkType: 2,
    propertyType: "independent_house",
  },
  {
    id: "p2",
    title: "3BHK · 70L",
    image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400",
    price: 70_00_000,
    builtUpArea: 1450,
    sellerName: "Rahul",
    bhkType: 3,
    propertyType: "apartment",
  },
];

export const MOCK_SELLERS: Record<string, Seller> = {
  s1: {
    id: "s1",
    name: "Nadeem",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100",
    phone: "+9198989898",
  },
};

export const MOCK_LOCALITIES: LocalityInfo[] = [
  {
    id: "l1",
    name: "Sector 32",
    city: "Faridabad",
    image: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=400",
    description:
      "Sector 32 is a bustling locality in Faridabad with a population of 25K.",
    highlights: ["Near Metro", "Schools & Hospitals nearby"],
    pros: ["Good connectivity", "Affordable"],
    cons: ["Traffic in peak hours"],
    priceTrend: 5.2,
  },
];

// List options for list_selection templates (sector 32, rent/buy)
export const SECTOR_OPTIONS = [
  { id: "uuid1", title: "sector 32 gurgaon" },
  { id: "uuid2", title: "sector 32 faridabad" },
];

export const RENT_BUY_OPTIONS = [
  { id: "rent_id", title: "rent" },
  { id: "buy_id", title: "buy" },
  { id: "dont_care", title: "dont care" },
];

// Price trend quarter-on-quarter for localities (used by price_trend template fallback)
export interface PriceTrendQoQ {
  quarter: string;
  changePercent: number; // positive = increase, negative = decrease
}

export const MOCK_PRICE_TREND_SECTOR_32_GURGAON: PriceTrendQoQ[] = [
  { quarter: "Q1 2024", changePercent: 2.1 },
  { quarter: "Q2 2024", changePercent: 1.5 },
  { quarter: "Q3 2024", changePercent: -0.3 },
  { quarter: "Q4 2024", changePercent: 3.2 },
];
