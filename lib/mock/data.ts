// Mock property, locality, and seller data for demo flow

export type BHKType = 1 | 2 | 3 | 4;
export type PropertyType = "flat" | "independent_house" | "villa" | "plot";
export type PropertyCategory = "buy" | "rent";

export interface Property {
  id: string;
  title: string;            // "3 BHK flat"
  projectName: string;      // "M3M Solitude Ralph Estate"
  tags: string[];           // ["RERA", "Ready to move"]
  image: string;
  price: number;            // raw INR
  priceFormatted: string;   // "₹3 Cr"
  builtUpArea: number;      // sqft
  locationFormatted: string; // "Sector 33, Sohna, Gurgaon"
  sellerName: string;
  category: PropertyCategory;
}

export interface Seller {
  id: string;
  name: string;
  image: string;
  phone: string;
}

export interface LocalityData {
  id: string;
  name: string;
  city: string;
  image: string;
  description: string;
  highlights: string[];
  pros: string[];
  cons: string[];
  priceTrend: number; // % change in last 1 year, e.g. 26.7 = +26.7%
  rating: number;     // 1-5
}

export interface SelectionItem {
  id: string;
  name: string;
  type: string;  // "City" | "Locality" | "Landmark" | "Project" | "Category"
  city: string;
}

export const MOCK_PROPERTIES: Property[] = [
  {
    id: "p1",
    title: "3 BHK flat",
    projectName: "M3M Solitude Ralph Estate",
    tags: ["RERA", "Ready to move"],
    image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600",
    price: 3_00_00_000,
    priceFormatted: "₹3 Cr",
    builtUpArea: 4750,
    locationFormatted: "Sector 33, Sohna, Gurgaon",
    sellerName: "Nadeem",
    category: "buy",
  },
  {
    id: "p2",
    title: "3 BHK flat",
    projectName: "Godrej Nature Plus",
    tags: ["RERA", "Possession by March, 2026"],
    image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600",
    price: 2_80_00_000,
    priceFormatted: "₹2.8 Cr",
    builtUpArea: 4200,
    locationFormatted: "Sector 85, Gurgaon",
    sellerName: "Rahul",
    category: "buy",
  },
  {
    id: "p3",
    title: "3 BHK flat",
    projectName: "DLF The Camellias",
    tags: ["Verified", "Semi-furnished"],
    image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600",
    price: 28_000,
    priceFormatted: "₹28,000/mo",
    builtUpArea: 3800,
    locationFormatted: "DLF Phase 5, Gurgaon",
    sellerName: "Priya",
    category: "rent",
  },
];

export const MOCK_SELLERS: Record<string, Seller> = {
  s1: {
    id: "s1",
    name: "Nadeem",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100",
    phone: "+91 98989 89898",
  },
};

export const MOCK_LOCALITIES: LocalityData[] = [
  {
    id: "l1",
    name: "DLF City Phase 4",
    city: "Gurgaon",
    image: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=600",
    description: "DLF City Phase 4 is a premium locality in Gurgaon with excellent connectivity and top-tier amenities.",
    highlights: ["Near Metro", "Top schools nearby", "MG Road 5 min"],
    pros: ["Great connectivity", "Premium infrastructure"],
    cons: ["High price point"],
    priceTrend: 26.7,
    rating: 4,
  },
  {
    id: "l2",
    name: "Sector 32",
    city: "Faridabad",
    image: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=600",
    description: "Sector 32 is a well-established locality in Faridabad with good infrastructure.",
    highlights: ["Near Metro", "Schools & Hospitals nearby"],
    pros: ["Affordable", "Good connectivity"],
    cons: ["Traffic in peak hours"],
    priceTrend: 5.2,
    rating: 3,
  },
];

export const SECTOR_OPTIONS: SelectionItem[] = [
  { id: "uuid1", name: "Sector 32, Gurgaon", type: "Locality", city: "Gurgaon" },
  { id: "uuid2", name: "Sector 32, Faridabad", type: "Locality", city: "Faridabad" },
];

export const RENT_BUY_OPTIONS: SelectionItem[] = [
  { id: "rent_id", name: "Rent", type: "Category", city: "" },
  { id: "buy_id", name: "Buy", type: "Category", city: "" },
  { id: "dont_care", name: "Don't care", type: "Category", city: "" },
];

export interface PriceTrendQoQ {
  quarter: string;
  changePercent: number;
}

export const MOCK_PRICE_TREND_SECTOR_32_GURGAON: PriceTrendQoQ[] = [
  { quarter: "Q1 2024", changePercent: 2.1 },
  { quarter: "Q2 2024", changePercent: 1.5 },
  { quarter: "Q3 2024", changePercent: -0.3 },
  { quarter: "Q4 2024", changePercent: 3.2 },
];
