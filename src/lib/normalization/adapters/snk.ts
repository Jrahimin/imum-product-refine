import type { CsvRow } from "../../csv";
import {
  emptyToNull,
  extractTitleOffer,
  isDiscretePackageCount,
  metaExtraValue,
  parseQuantityFromText,
} from "../primitives";
import type { Quantity } from "../types";
import type { AdapterDraft, SourceAdapter } from "./types";
import { text } from "./types";

const SPEC_COLUMNS = ["length", "width", "height", "depth", "weight", "power", "color", "dimensions"] as const;

/** Require title agreement and reject common container/appliance capacity contexts for generic Tūris. */
function titleSupportsGenericVolume(title: string, volume: Quantity): boolean {
  if (/\b(?:kibir|vonel|talp(?:a|os)|bak(?:as|elis)|kanistr|šaldytuv|puodel|pistolet|virdul)/i.test(title)) {
    return false;
  }
  const titleQuantity = parseQuantityFromText(title);
  return titleQuantity?.unit === volume.unit && titleQuantity.value === volume.value;
}

/** Map SNK using structured extra fields first, then high-confidence title fallback. */
export const snkAdapter: SourceAdapter = {
  source: "SNK",
  extract(row: CsvRow): AdapterDraft {
    const title = row.title ?? "";

    // identity
    const identity = {
      source: "SNK" as const,
      countryCode: text(row, "country_code"),
      sourceId: text(row, "source_id"),
      recordId: text(row, "record_id"),
      title,
      brand: text(row, "brand"),
      manufacturer: text(row, "manufacturer"),
      model: text(row, "model"),
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
    });

    const extra: Record<string, string> = {};
    for (const field of SPEC_COLUMNS) {
      const value = text(row, field);
      if (value) extra[field] = value;
    }
    const productType = metaExtraValue(row.meta, "Prekės tipas");
    if (productType) extra.productType = productType;

    const structuredPackRaw = metaExtraValue(row.meta, "Vienetai pakuotėje");
    const structuredPack = isDiscretePackageCount(structuredPackRaw);
    const packageLitersRaw = metaExtraValue(row.meta, "Kiekis pakuotėje, l");
    const genericVolumeRaw = metaExtraValue(row.meta, "Tūris");
    const packageLiters = parseQuantityFromText(packageLitersRaw, {
      unit: "L",
      kind: "volume",
    });
    const genericVolume = parseQuantityFromText(genericVolumeRaw);
    const trustedGenericVolume =
      genericVolume && titleSupportsGenericVolume(title, genericVolume) ? genericVolume : null;
    const volume = packageLiters ?? trustedGenericVolume;
    if (genericVolumeRaw && !trustedGenericVolume) extra.volumeRaw = genericVolumeRaw;

    const warnings = [...titleOffer.warnings];
    const evidence = [...titleOffer.evidence];

    let packageCount = titleOffer.packageCount;
    let packageCountRaw = titleOffer.packageCountRaw;
    if (structuredPack != null && structuredPackRaw) {
      // Structured pack count wins over the title when both exist.
      if (titleOffer.packageCount != null && titleOffer.packageCount !== structuredPack) {
        warnings.push({
          code: "title_meta_package_mismatch",
          message: `Title pack ${titleOffer.packageCount} disagrees with Vienetai pakuotėje ${structuredPack}.`,
        });
      }
      packageCount = structuredPack;
      packageCountRaw = structuredPackRaw;
      evidence.push({
        field: "packageCount",
        raw: structuredPackRaw,
        origin: "meta",
        rule: "structured_package_count",
      });
    }

    let itemQuantity = titleOffer.itemQuantity;
    let totalQuantity = titleOffer.totalQuantity;
    if (volume) {
      // These SNK keys describe package contents, not per-item size × pack count.
      itemQuantity = volume;
      totalQuantity = volume;
      evidence.push({ field: "itemQuantity", raw: volume.raw, origin: "meta", rule: "structured_volume" });
    }

    if (identity.brand) evidence.push({ field: "brand", raw: identity.brand, origin: "column", rule: "identity_column" });
    if (identity.barcode) {
      evidence.push({ field: "barcode", raw: identity.barcode, origin: "column", rule: "identity_column" });
    }

    return {
      identity,
      taxonomy,
      offer: {
        packageCount,
        packageCountRaw,
        itemQuantity,
        totalQuantity,
        bundleBlocked: titleOffer.bundleBlocked,
      },
      specifications: {
        dimensions: titleOffer.dimensions,
        strength: null,
        extra,
      },
      evidence,
      warnings,
      rawPrices: {
        price: row.price ?? "",
        final_price: row.final_price ?? "",
        discount_price: row.discount_price ?? "",
        member_price: row.member_price ?? "",
      },
    };
  },
};
