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

// Contract §4.14 nested_qna — sector 21 options
export const SECTOR_21_OPTIONS: SelectionItem[] = [
  { id: "uuid3", name: "Sector 21, Gurgaon", type: "Locality", city: "Gurgaon" },
  { id: "uuid4", name: "Sector 21, Faridabad", type: "Locality", city: "Faridabad" },
];

// Contract §4.18 — Sector 21 locality sample (for locality_info after nested_qna / "buy")
export const MOCK_LOCALITY_SECTOR_32_GURGAON = {
  id: "l1",
  name: "Sector 32",
  city: "Gurgaon",
  image: "https://images.housing.com/l1.jpg",
  description: "Sector 32 is a bustling locality in Gurgaon with a population of 25K.",
  highlights: ["highlight 1", "highlight 2"],
  pros: ["pro1", "pro2"],
  cons: ["con1"],
  priceTrend: 26.7,
  rating: 4,
};
export const MOCK_LOCALITY_SECTOR_21_GURGAON = {
  id: "l3",
  name: "Sector 21",
  city: "Gurgaon",
  image: "https://images.housing.com/l1.jpg",
  description: "Sector 21 is a bustling locality in Gurgaon with a population of 25K.",
  highlights: ["highlight 1", "highlight 2"],
  pros: ["pro1", "pro2"],
  cons: ["con1"],
  priceTrend: 22,
  rating: 4,
};

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

// Property learn more (design: property learn more.png)
export interface PropertyDetailsData {
  title: string;
  builder: string;
  address: string;
  overview: string;
  type: string;
  builtUpArea: number;
  bedrooms: number;
  bathrooms: number;
  balconies: number;
  floor: number;
  furnishing: string;
  priceLabel: string;
  priceValue: string;
  depositLabel?: string;
  depositValue?: string;
  parking: string;
  amenities: string[];
  propertyManagerDesc: string;
}

export const MOCK_PROPERTY_DETAILS_P2: PropertyDetailsData = {
  title: "3 BHK Apartment",
  builder: "Godrej Properties Ltd.",
  address: "Godrej Nature Plus, Sector 85, Gurgaon",
  overview: "Here is an excellent 3 BHK Apartment available for buy in Gurgaon. Surrounded by natural greens and equipped with numerous amenities, this spacious home offers a comfortable lifestyle with good connectivity to major landmarks.",
  type: "3 BHK Apartment",
  builtUpArea: 1820,
  bedrooms: 3,
  bathrooms: 3,
  balconies: 3,
  floor: 17,
  furnishing: "Semi-Furnished",
  priceLabel: "Price",
  priceValue: "₹2.8 Cr",
  parking: "2 parking space(s)",
  amenities: ["Parking", "Regular Water Supply", "Gym", "Swimming Pool", "Kids Area", "Sports Facility", "Lift", "Power Backup", "Intercom", "CCTV"],
  propertyManagerDesc: "Godrej Properties Ltd is the real estate segment of the 120-year Godrej Group, known for excellent craftsmanship in contemporary housing projects.",
};

// Locality learn more (design: locality learn more.png) — Sector 46 style
export interface LocalityLearnMoreData {
  name: string;
  tagline: string;
  summaryTitle: string;
  highlights: string[];
  followUpQuestion: string;
}

export const MOCK_LOCALITY_LEARN_MORE_SECTOR_46: LocalityLearnMoreData = {
  name: "Sector 46, Gurgaon",
  tagline: "Peaceful Living with Great Connectivity",
  summaryTitle: "Why Sector 46 is a Great Choice",
  highlights: [
    "Mid-range residential locality with apartments, builder floors, and independent houses",
    "Well connected: 10 km from Gurgaon railway, 20 km from IGI Airport, near NH-8 and metro",
    "Ample amenities: 9 schools, 10 hospitals, 67 restaurants, plus shopping centers nearby",
    "Notable places include Manav Rachna International School and Amity International School",
    "Real estate demand supported by proposed metro expansion and local commercial hubs",
  ],
  followUpQuestion: "Would you like me to show available properties in Sector 46, Gurgaon or compare it with nearby areas?",
};

// Locality price trend (design: locality price trend.png) — Sector 86
export interface LocalityPriceTrendData {
  localityName: string;
  averagePricePerSqft: string;
  oneYearGrowthPercent: number;
  availableProperties: number;
  minPricePerSqft: string;
  maxPricePerSqft: string;
  quarterlyTrends: { quarter: string; pricePerSqft: string }[];
  latestUpdate: { period: string; pricePerSqft: string };
  footerText?: string;
}

export const MOCK_LOCALITY_PRICE_TREND_SECTOR_86: LocalityPriceTrendData = {
  localityName: "Sector 86",
  averagePricePerSqft: "₹12,220",
  oneYearGrowthPercent: 11.43,
  availableProperties: 188,
  minPricePerSqft: "₹5,666",
  maxPricePerSqft: "₹29,841",
  quarterlyTrends: [
    { quarter: "Q1", pricePerSqft: "₹10,691" },
    { quarter: "Q2", pricePerSqft: "₹11,442" },
    { quarter: "Q3", pricePerSqft: "₹11,242" },
    { quarter: "Q4", pricePerSqft: "₹12,220" },
  ],
  latestUpdate: { period: "Q1 2026", pricePerSqft: "₹11,850" },
  footerText: "This data helps you make informed property decisions.",
};

// Locality rating review (design: locality rating review.png)
export interface LocalityRatingReviewData {
  localityName?: string;
  overallRating: number;
  maxRating: number;
  reviewCount: number;
  distribution: { stars: number; count: number; percentage: number }[];
  categoryBreakdown: { categoryName: string; rating: number; maxRating: number }[];
  topStrengths: string[];
  areasToConsider: string[];
  footerText?: string;
}

export const MOCK_LOCALITY_RATING_REVIEW: LocalityRatingReviewData = {
  localityName: "Sector 46, Gurgaon",
  overallRating: 4.09,
  maxRating: 5,
  reviewCount: 11,
  distribution: [
    { stars: 4, count: 9, percentage: 82 },
    { stars: 3, count: 2, percentage: 18 },
  ],
  categoryBreakdown: [
    { categoryName: "Neighbourhood", rating: 4.27, maxRating: 5 },
    { categoryName: "Connectivity", rating: 4.09, maxRating: 5 },
    { categoryName: "Safety", rating: 4.09, maxRating: 5 },
    { categoryName: "Livability", rating: 4.0, maxRating: 5 },
    { categoryName: "Price attractiveness", rating: 4.0, maxRating: 5 },
  ],
  topStrengths: ["Wide roads", "Nearby supermarkets and malls", "Proximity to NH8", "Good connectivity"],
  areasToConsider: ["Street lights not working", "Safety concerns", "Water shortage"],
  footerText: "Ask for more details about amenities or specific concerns.",
};

// Project transaction details (design: project transaction details.png)
export interface ProjectTransactionDetailsData {
  projectName: string;
  location: string;
  totalTransactions: number;
  sales: number;
  mortgages: number;
  averageAreaSqft: number;
  sizeRangeMin: number;
  sizeRangeMax: number;
  activeTransactionsLast6Months: number;
  recentMortgagesLast6Months: number;
  latestTransactions: { unitId: string; detail: string; date: string }[];
  leasedCount: number;
  leasedPercentage: number;
  marketActivity: string;
  footerText?: string;
  ctaText?: string;
}

export const MOCK_PROJECT_TRANSACTION_DETAILS: ProjectTransactionDetailsData = {
  projectName: "Godrej Gold County",
  location: "Tumkur Road",
  totalTransactions: 10,
  sales: 8,
  mortgages: 2,
  averageAreaSqft: 2742.5,
  sizeRangeMin: 2324.2,
  sizeRangeMax: 3160.9,
  activeTransactionsLast6Months: 1,
  recentMortgagesLast6Months: 1,
  latestTransactions: [
    { unitId: "Unit", detail: "N/A", date: "Sep 2025" },
    { unitId: "Unit GGCD10V076", detail: "N/A", date: "Jun 2025" },
    { unitId: "Unit GGCD10V076", detail: "N/A", date: "Jun 2025" },
    { unitId: "Unit GGCDIOV039", detail: "N/A", date: "Jan 2025" },
    { unitId: "Unit", detail: "2324 sq ft", date: "Jan 2025" },
  ],
  leasedCount: 2,
  leasedPercentage: 20,
  marketActivity: "Low",
  footerText: "This transaction data helps assess overall market activity.",
  ctaText: "Ask for specific unit details or price trends.",
};
