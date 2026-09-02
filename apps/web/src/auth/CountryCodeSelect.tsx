import { ThemedSelect } from "../ThemedSelect.tsx";
import type { ThemedSelectOption } from "../ThemedSelect.tsx";
import { CountryFlag } from "./CountryFlag";
import {
  DEFAULT_COUNTRY_ID,
  SUPPORTED_COUNTRIES,
  findCountry,
} from "./identifier";
import type { CountryOption } from "./identifier";

export const COUNTRY_OPTIONS: readonly ThemedSelectOption[] =
  SUPPORTED_COUNTRIES.map((country) => [
    country.id,
    country.dialCode,
    {
      flag: <CountryFlag code={country.id} />,
      label: `${country.name} (${country.dialCode})`,
      searchKeywords: `${country.name} ${country.dialCode} ${country.id}`,
    },
  ]);

export function getDefaultCountry(): CountryOption {
  const country = findCountry(DEFAULT_COUNTRY_ID);

  if (!country) {
    throw new Error("DEFAULT_COUNTRY_ID must name one of SUPPORTED_COUNTRIES.");
  }

  return country;
}

interface CountryCodeSelectProps {
  value: string;
  onCountryChange: (country: CountryOption) => void;
  disabled?: boolean;
  id?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

export function CountryCodeSelect({
  value,
  onCountryChange,
  disabled = false,
  id,
  triggerClassName = "",
  contentClassName = "",
}: CountryCodeSelectProps) {
  const selectedCountry = findCountry(value) ?? getDefaultCountry();

  return (
    <ThemedSelect
      id={id}
      ariaLabel="Country code"
      contentClassName={`country-code-select__menu ${contentClassName}`.trim()}
      disabled={disabled}
      onValueChange={(countryId) => {
        const nextCountry = findCountry(countryId);
        if (nextCountry) onCountryChange(nextCountry);
      }}
      options={COUNTRY_OPTIONS}
      searchable
      searchPlaceholder="Search country or code..."
      triggerClassName={`country-code-select__trigger ${triggerClassName}`.trim()}
      value={selectedCountry.id}
    />
  );
}
