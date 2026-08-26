import type { CsvRow } from "../../csv";
import { emptyToNull, extractTitleOffer } from "../primitives";
import type { AdapterDraft, SourceAdapter } from "./types";
import { copyNativeFields, identityText, text } from "./types";

const PAINT_CATEGORY = "DAŽAI IR PARUOŠIMO MEDŽIAGOS";
const AUTO_CATEGORY = "AUTOMOBILIŲ PREKĖS";
const PET_CATEGORY = "GYVŪNŲ PREKĖS";
const PAINT_TOOL_SUBCATEGORY = "Įrankiai dažymui";
const HOUSEHOLD_CHEMISTRY_SUBSUB = "Buitinė chemija";
const AGROCHEM_SUBCATEGORY = "Agrochemija";

const SPEC_COLUMNS = ["length", "width", "height", "depth", "weight", "power", "color", "dimensions"] as const;

/** Allow lone volume only where the catalogue path describes consumable contents. */
function allowsStandaloneVolume(row: CsvRow, category: string | null): boolean {
  if (category === PAINT_CATEGORY) {
    return text(row, "subsubcategory") !== PAINT_TOOL_SUBCATEGORY;
  }
  // Auto accessories contain roof-box, refrigerator, engine, and airflow capacities.
  return category === AUTO_CATEGORY && text(row, "subcategory") === "Auto chemija";
}

/** Allow lone mass only for clearly identified pet-food/consumable contents. */
function allowsStandaloneMass(row: CsvRow, category: string | null, title: string): boolean {
  if (/\b(?:ne daugiau kaip|atlaikomas svoris|iki)\b/i.test(title)) return false;
  if (category === PET_CATEGORY) {
    const subcategory = text(row, "subcategory") ?? "";
    return /maistas|kraikas/i.test(subcategory);
  }
  // Miscategorised pet food still names the consumable; do not enable paint/hardware mass here.
  return /\b(?:ėdalas|konserv(?:ai|uotas))\b/i.test(title);
}

/** Allow bare `4 x 100 g` only where the catalogue path describes identical consumable packs. */
function allowsBareCountXQuantity(row: CsvRow, category: string | null, title: string): boolean {
  if (category === PET_CATEGORY) return allowsStandaloneMass(row, category, title);
  if (category === PAINT_CATEGORY) return allowsStandaloneVolume(row, category);
  if (text(row, "subsubcategory") === HOUSEHOLD_CHEMISTRY_SUBSUB) return true;
  if (text(row, "subcategory") === AGROCHEM_SUBCATEGORY) return true;
  // A few pet-food rows are miscategorised; the title still names the consumable.
  return /\b(?:ėdalas|konserv(?:ai|uotas))\b/i.test(title);
}

/** Map one MKV row into the common draft. MKV `N4`/`N8` are not pharmacy packs. */
export const mkvAdapter: SourceAdapter = {
  source: "MKV",
  extract(row: CsvRow): AdapterDraft {
    const title = row.title ?? "";
    const category = emptyToNull(row.category);

    // identity
    const identity = {
      source: "MKV" as const,
      countryCode: text(row, "country_code"),
      sourceId: text(row, "source_id"),
      recordId: text(row, "record_id"),
      title,
      brand: identityText(row, "brand"),
      manufacturer: identityText(row, "manufacturer"),
      model: identityText(row, "model"),
      barcode: text(row, "barcode"),
    };

    // taxonomy — preserved verbatim from the source catalogue
    const taxonomy = {
      category,
      subcategory: text(row, "subcategory"),
      subsubcategory: text(row, "subsubcategory"),
      subsubsubcategory: text(row, "subsubsubcategory"),
    };

    // package/quantity — title only; MKV meta has no package-count keys
    const titleOffer = extractTitleOffer(title, {
      allowStandaloneVolume: allowsStandaloneVolume(row, category),
      allowStandaloneMass: allowsStandaloneMass(row, category, title),
      allowPharmacyN: false,
      allowBareCountXQuantity: allowsBareCountXQuantity(row, category, title),
    });

    // specifications — structured physical fields are identity, not price bases
    const extra: Record<string, string> = {};
    for (const field of SPEC_COLUMNS) {
      const value = text(row, field);
      if (value) extra[field] = value;
    }
    copyNativeFields(row, extra);

    const evidence = [...titleOffer.evidence];
    if (identity.brand) evidence.push({ field: "brand", raw: identity.brand, origin: "column", rule: "identity_column" });
    if (identity.model) evidence.push({ field: "model", raw: identity.model, origin: "column", rule: "identity_column" });

    return {
      identity,
      taxonomy,
      offer: {
        packageCount: titleOffer.packageCount,
        packageCountRaw: titleOffer.packageCountRaw,
        itemQuantity: titleOffer.itemQuantity,
        totalQuantity: titleOffer.totalQuantity,
        bundleBlocked: titleOffer.bundleBlocked,
        blockUnitPrice: false,
        blockPieceUnitPrice: titleOffer.mixedSetBlocked,
      },
      specifications: {
        dimensions: titleOffer.dimensions,
        strength: null,
        extra,
      },
      evidence,
      warnings: titleOffer.warnings,
      rawPrices: {
        price: row.price ?? "",
        final_price: row.final_price ?? "",
        discount_price: row.discount_price ?? "",
        member_price: row.member_price ?? "",
      },
    };
  },
};
