declare module "world-countries" {
  type CountryEntry = {
    altSpellings?: string[];
    cca2?: string;
    cca3?: string;
    latlng?: [number, number];
    name?: {
      common?: string;
      official?: string;
    };
  };

  const countries: CountryEntry[];
  export default countries;
}
