/**
 * The colour of a document's type badge, by its extension ("PDF", "DOCX"):
 * the same in chat file cards and the storage page. Kept on its own so a
 * page can use it without loading chat's attachment code (PDF previews).
 */
export function fileTone(extension: string): string {
  if (extension === "PDF") return "bg-[#e5484d]";
  if (["DOC", "DOCX", "TXT", "MD"].includes(extension)) return "bg-[#2f6fde]";
  if (["XLS", "XLSX", "CSV"].includes(extension)) return "bg-[#1f9d55]";
  if (["PPT", "PPTX"].includes(extension)) return "bg-[#e8710a]";
  return "bg-[#7a8699]";
}
