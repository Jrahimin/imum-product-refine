import type { CsvRow } from "../../csv";
import { emptyToNull, extractTitleOffer, parseDimensions, parseJsonObject } from "../primitives";
import type { AdapterDraft, SourceAdapter } from "./types";
import { copyNativeFields, identityText, text } from "./types";

const SPEC_COLUMNS = ["length", "width", "height", "depth", "weight", "power", "color", "dimensions"] as const;

/** Map TOP from strong identity columns; do not force DIY-style title quantities. */
export const topAdapter: SourceAdapter = {
  source: "TOP",
  extract(row: CsvRow): AdapterDraft {
    const title = row.title ?? "";

    // identity
    const identity = {
      source: "TOP" as const,
      countryCode: text(row, "country_code"),
      sourceId: text(row, "source_id"),
      recordId: text(row, "record_id"),
      title,
      brand: identityText(row, "brand"),
      manufacturer: identityText(row, "manufacturer"),
      model: identityText(row, "model"),
      barcode: text(row, "barcode"),
    };

    // taxonomy
    const taxonomy = {
      category: emptyToNull(row.category),
      subcategory: text(row, "subcategory"),
      subsubcategory: text(row, "subsubcategory"),
      subsubsubcategory: text(row, "subsubsubcategory"),
    };

    const titleOffer = extractTitleOffer(title, {
      allowStandaloneVolume: false,
      allowStandaloneMass: false,
      allowPharmacyN: false,
      allowBareCountXQuantity: false,
    });

    const extra: Record<string, string> = {};
    for (const field of SPEC_COLUMNS) {
      const value = text(row, field);
      if (value) extra[field] = value;
    }
    copyNativeFields(row, extra);

    const meta = parseJsonObject(row.meta);
    if (meta) {
      for (const key of ["power", "width", "height", "depth", "weight"] as const) {
        const value = meta[key];
        if (value != null && extra[key] == null) extra[key] = String(value);
      }
    }

    const columnDimensions = parseDimensions(row.dimensions ?? "");
    const evidence = [...titleOffer.evidence];
    if (identity.brand) evidence.push({ field: "brand", raw: identity.brand, origin: "column", rule: "identity_column" });
    if (identity.model) evidence.push({ field: "model", raw: identity.model, origin: "column", rule: "identity_column" });
    if (identity.barcode) {
      evidence.push({ field: "barcode", raw: identity.barcode, origin: "column", rule: "identity_column" });
    }

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
        dimensions: titleOffer.dimensions ?? columnDimensions,
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
