import { LogoUploadField } from "../home-page-settings/LogoUploadField";
import { useAcademyBrand } from "../services/academy";
import {
  useRemoveInvoiceLogo,
  useUploadInvoiceLogo,
} from "../services/platform";

/**
 * The logo printed on invoices, on the invoice's white. Without one of its
 * own, the preview shows the General tab's logo, which is what invoices then
 * print, so a light-text logo is seen to vanish here before an invoice does.
 */
export function InvoiceLogoField({
  logoUrl,
  setNotice,
}: {
  logoUrl: string | null;
  setNotice?: (message: string) => void;
}) {
  const upload = useUploadInvoiceLogo();
  const remove = useRemoveInvoiceLogo();
  const brand = useAcademyBrand().data;
  const name = brand?.name ?? "";

  return (
    <LogoUploadField
      label="Invoice logo"
      inputLabel="Choose an invoice logo image"
      logoUrl={logoUrl}
      alt={name || "Invoice logo"}
      surface="light"
      fallback={
        brand?.logoUrl ? (
          <img
            alt={name || "Academy logo"}
            className="block h-8 w-auto max-w-60"
            src={brand.logoUrl}
          />
        ) : (
          <span className="text-2xl leading-8 font-bold tracking-[-0.5px] text-[#111827]">
            {name}
          </span>
        )
      }
      hint={
        logoUrl
          ? "Printed on invoices instead of the General tab's logo."
          : "Invoices print the General tab's logo, shown here. Upload a version with dark text if it does not show well on white."
      }
      upload={upload}
      remove={remove}
      uploadedNotice="Invoice logo uploaded."
      removedNotice="Invoice logo removed. Invoices print the General tab's logo."
      setNotice={setNotice}
    />
  );
}
