declare module "pliny" {
  export const SearchProvider: React.ComponentType<unknown>;
  export interface SearchConfig {
    // You can add fields here if you want stricter typing
    [key: string]: unknown;
  }
}
declare module "pliny/search" {


  // Declare SearchProvider as a React component with props
  export const SearchProvider: React.FC<SearchProviderProps>;

  // Export the type as well if needed elsewhere
  export const SearchConfig = Record<SearchConfig>;
  
}
declare module "pliny/analytics" {
  export const Analytics: React.FC<Analytics>;
  export const AnalyticsConfig: React.FC<AnalyticsConfig>;  
  export const SearchConfig: React.FC<SearchConfig>;  
}

declare module "pliny/search/AlgoliaButton" {
  
  // Declare SearchProvider as a React component with props
  export const AlgoliaButton: React.FC<AlgoliaButton>;

}
  declare module "pliny/search/KBarButton" {
  
  // Declare SearchProvider as a React component with props
  export const KBarButton: React.FC<KBarButton>;

}


