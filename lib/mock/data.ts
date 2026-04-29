// Mock property, locality, and seller data for demo flow

export type BHKType = 1 | 2 | 3 | 4;
export type PropertyType = "flat" | "independent_house" | "villa" | "plot";
export type PropertyCategory = "buy" | "rent";

export interface Seller {
  id: string;
  name: string;
  image: string;
  phone: string;
}

export interface LocalityData {
  id: string;
  name: string;
  displayName?: string;
  address?: string;
  cityName?: string;
  localityName?: string;
  cityUuid?: string;
  image: string;
  description: string;
  highlights: string[];
  pros: string[];
  cons: string[];
  url?: string; // link to locality details page
  link?: string; // backward compatibility
  priceTrend: number; // avg price per sqft
  rating: number;     // 1-5
  percentGrowth?: number; // % change in last 1 year
}

export interface SelectionItem {
  id: string;
  name: string;
  type: string;  // "City" | "Locality" | "Landmark" | "Project" | "Category"
  city: string;
}

// Note: legacy `MOCK_PROPERTIES` is now represented by `PropertyCarouselCard` below.

// Property card schema for `property_carousel`.
// Keep it minimal: only fields needed by the UI/design.
export type InventoryPropertyType = "rent" | "project" | "resale";

export interface ShortAddressLite {
  display_name: string;
}

export interface RegionEntityLite {
  name?: string | null;
}

export interface InventoryConfigLite {
  // rent: 1 furnished, 2 semi-furnished, 3 unfurnished
  furnish_type_id?: number | null | undefined;
  area_value_in_unit?: number | null | undefined;
}

export interface PropertyCarouselCard {
  // Unique identifier for a specific card instance (multi-card experiment support).
  // `id` remains the stable property identifier for downstream interactions.
  _id: string;
  id: string;
  type: InventoryPropertyType;

  title: string; // e.g. "3 BHK flat"
  name?: string | null | undefined; // project name

  // Optional fields that may appear in real payloads / demo cards.
  price_on_request?: boolean | null | undefined;
  current_status?: string | null | undefined;
  possession_date?: string | null | undefined;

  short_address: ShortAddressLite[]; // address = short_address.map(x => x.display_name)
  region_entities?: RegionEntityLite[] | null | undefined;

  is_rera_verified: boolean | null | undefined;
  is_verified?: boolean | null | undefined;

  inventory_canonical_url: string;
  thumb_image_url: string; // thumb_image_url.replace('version','large')

  property_tags: string[]; // resale/project second pill

  // price: rent/resale/project
  formatted_price?: string | null | undefined;
  formatted_min_price?: string | null | undefined;
  formatted_max_price?: string | null | undefined;

  // area: rent/resale/project
  unit_of_area: string; // e.g. "sq.ft."
  display_area_type: string; // e.g. "Built up area"
  min_selected_area_in_unit?: number | null | undefined; // project
  max_selected_area_in_unit?: number | null | undefined; // project
  inventory_configs: InventoryConfigLite[]; // rent/resale: inventory_configs[0].*
}

export const MOCK_PROPERTY_CAROUSEL_CARDS: PropertyCarouselCard[] = [
  // Project (RERA)
  {
    _id: "p1__card_1",
    id: "p1",
    type: "project",
    price_on_request: false,
    current_status: "Under Construction",
    possession_date: "Jun, 2023",
    title: "2, 3 BHK Apartments",
    name: "Godrej Air",
    short_address: [{ display_name: "Sector 85" }, { display_name: "Gurgaon" }],

    is_rera_verified: true,
    inventory_canonical_url: "https://example.com/property/p1",
    thumb_image_url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600",
    property_tags: ["Ready to move"],
    formatted_min_price: "3 Cr",
    formatted_max_price: "3.5 Cr",
    unit_of_area: "sq.ft.",
    display_area_type: "Built up area",
    min_selected_area_in_unit: 2500,
    max_selected_area_in_unit: 4750,
    inventory_configs: [],
  },
  // Rent (Verified + furnish type)
  {
    _id: "p2__card_1",
    id: "p2",
    type: "rent",
    title: "3 BHK flat",
    short_address: [
      { display_name: "Sector 33" },
      { display_name: "Sohna" },
      { display_name: "Gurgaon" },
    ],
    region_entities: [{ name: "M3M Solitude Ralph Estate" }],
    is_rera_verified: false, // project only
    is_verified: true,
    inventory_canonical_url: "https://example.com/property/p2",
    thumb_image_url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600",
    property_tags: [],
    formatted_price: "30,000",
    unit_of_area: "sq.ft.",
    display_area_type: "Built up area",
    inventory_configs: [{ furnish_type_id: 2, area_value_in_unit: 4750 }],
  },
  {
    _id: "p4__card_1",
    id: "p4",
    type: "rent",
    title: "2 BHK independent floor",
    short_address: [
      { display_name: "Sector 23" },
      { display_name: "Sohna" },
      { display_name: "Gurgaon" },
    ],
    is_rera_verified: true,
    is_verified: false,
    inventory_canonical_url: "https://example.com/property/p4",
    thumb_image_url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600",
    property_tags: [],
    formatted_price: "12,000",
    unit_of_area: "sq.ft.",
    display_area_type: "Built up area",
    inventory_configs: [{ furnish_type_id: 3, area_value_in_unit: 750 }],
  },
  // Resale (Verified + possession)
  {
    _id: "p3__card_1",
    id: "p3",
    type: "resale",
    title: "3 BHK apartment",
    short_address: [
      { display_name: "Sector 33" },
      { display_name: "Sohna" },
      { display_name: "Gurgaon" },
    ],
    is_rera_verified: false, // project only
    is_verified: true,
    region_entities: [{ name: "M3M Solitude Ralph Estate" }],
    inventory_canonical_url: "https://example.com/property/p3",
    thumb_image_url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600",
    property_tags: ["Possession by March, 2026"],
    formatted_min_price: "3 Cr",
    unit_of_area: "sq.ft.",
    display_area_type: "Built up area",
    inventory_configs: [{ furnish_type_id: null, area_value_in_unit: 4750 }],
  },
  {
    _id: "p5__card_1",
    id: "p5",
    type: "resale",
    title: "3 BHK apartment",
    short_address: [
      { display_name: "Sector 32" },
      { display_name: "Sohna" },
      { display_name: "Gurgaon" },
    ],
    is_rera_verified: true,
    is_verified: false,
    inventory_canonical_url: "https://example.com/property/p3",
    thumb_image_url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600",
    property_tags: ["Ready to move"],
    formatted_min_price: "3.5 Cr",
    unit_of_area: "sq.ft.",
    display_area_type: "Built up area",
    inventory_configs: [{ furnish_type_id: 2, area_value_in_unit: 1200 }],
  },
];

// Kept for backward compatibility with templates that import `MOCK_PROPERTIES`.
export const MOCK_PROPERTIES: PropertyCarouselCard[] = MOCK_PROPERTY_CAROUSEL_CARDS;


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
  id: "f745c4c0226869fa87b8",
  name: "Sector 37D",
  displayName: "Sector 37D, Gurgaon",
  address: "Dwarka Expressway, Gurgaon, Gurgaon District",
  cityName: "Gurgaon",
  localityName: "",
  cityUuid: "3c69d8421a77f8f8b611",
  rating: 4.5,
  priceTrend: 11040,
  image: "https://is1-3.housingcdn.com/d89cff98/149789bd050d77e9b9b05e730b1e7141/v0/version.jpg",
  percentGrowth: 5.62,
};
export const MOCK_LOCALITY_SECTOR_21_GURGAON = {
  id: "1864ac472c1a7739556b",
  name: "Sector 36",
  displayName: "Sector 36, Sohna, Gurgaon",
  address: "Sohna, Gurgaon, Gurgaon District",
  cityName: "Gurgaon",
  localityName: "",
  cityUuid: "3c69d8421a77f8f8b611",
  rating: 4.5,
  priceTrend: 9740,
  percentGrowth: -0.96,
};


export interface PriceTrendQoQ {
  quarter: string;
  changePercent: number;
}


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
