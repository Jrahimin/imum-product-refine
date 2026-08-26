import type { CsvRow } from "../../csv";
import {
  emptyToNull,
  extractTitleOffer,
  isDiscretePackageCount,
  metaExtraValue,
  parseQuantityFromText,
  reconcileStructuredPackageCount,
} from "../primitives";
import type { EvidenceItem, Quantity } from "../types";
import type { AdapterDraft, SourceAdapter } from "./types";
import { copyNativeFields, identityText, text } from "./types";

const SPEC_COLUMNS = ["length", "width", "height", "depth", "weight", "power", "color", "dimensions"] as const;

/** Require title agreement and reject common container/appliance capacity contexts for generic Tūris. */
function titleSupportsGenericVolume(title: string, volume: Quantity): boolean {
  if (/\b(?:kibir|vonel|talp(?:a|os)|bak(?:as|elis)|kanistr|šaldytuv|puodel|pistolet|virdul)/i.test(title)) {
    return false;
  }
  const titleQuantity = parseQuantityFromText(title);
  return titleQuantity?.unit === volume.unit && titleQuantity.value === volume.value;
}

/** True when the title already named an identical-item composite pack. */
function titleHasExplicitComposite(evidence: EvidenceItem[]): boolean {
  return evidence.some(
    (item) =>
      item.rule === "quantity_x_count" ||
      item.rule === "quantity_paren_count" ||
      item.rule === "count_x_quantity",
  );
}

/** True when SNK taxonomy/title clearly names pet food or litter, not generic catalogue weight. */
function allowsSnkPetConsumableMass(row: CsvRow, title: string): boolean {
  const category = row.category ?? "";
  const productType = metaExtraValue(row.meta, "Prekės tipas") ?? "";
  const haystack = `${category} ${productType} ${title}`;
  if (!/gyvūn/i.test(`${category} ${productType}`)) return false;
  return /maistas|ėdalas|kraikas|pašaras/i.test(haystack);
}

/** True when two quantities are the same canonical amount. */
function quantitiesEqual(left: Quantity | null, right: Quantity): boolean {
  return left != null && left.unit === right.unit && left.kind === right.kind && left.value === right.value;
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
      allowStandaloneMass: allowsSnkPetConsumableMass(row, title),
      allowPharmacyN: false,
      allowBareCountXQuantity: false,
    });

    const extra: Record<string, string> = {};
    for (const field of SPEC_COLUMNS) {
      const value = text(row, field);
      if (value) extra[field] = value;
    }
    copyNativeFields(row, extra);
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
    const packageKgRaw = metaExtraValue(row.meta, "Kiekis pakuotėje, kg");
    const packageKg = parseQuantityFromText(packageKgRaw, {
      unit: "kg",
      kind: "mass",
    });
    const genericVolume = parseQuantityFromText(genericVolumeRaw);
    const trustedGenericVolume =
      genericVolume && titleSupportsGenericVolume(title, genericVolume) ? genericVolume : null;
    // Package liters win over kg when both exist; generic Svoris is product weight, not contents.
    const packageContents = packageLiters ?? packageKg;

    const warnings = [...titleOffer.warnings];
    const evidence = [...titleOffer.evidence];

    let packageCount = titleOffer.packageCount;
    let packageCountRaw = titleOffer.packageCountRaw;
    let itemQuantity = titleOffer.itemQuantity;
    let totalQuantity = titleOffer.totalQuantity;
    let blockUnitPrice = false;
    if (structuredPack != null && structuredPackRaw) {
      const reconciled = reconcileStructuredPackageCount(
        {
          packageCount: titleOffer.packageCount,
          itemQuantity: titleOffer.itemQuantity,
          totalQuantity: titleOffer.totalQuantity,
        },
        structuredPack,
        structuredPackRaw,
      );
      if (reconciled.mismatched) {
        warnings.push({
          code: "title_meta_package_mismatch",
          message: `Title pack ${titleOffer.packageCount} disagrees with Vienetai pakuotėje ${structuredPack}.`,
        });
      }
      packageCount = reconciled.packageCount;
      packageCountRaw = reconciled.packageCountRaw;
      itemQuantity = reconciled.itemQuantity;
      totalQuantity = reconciled.totalQuantity;
      blockUnitPrice = reconciled.blockUnitPrice;
      evidence.push({
        field: "packageCount",
        raw: structuredPackRaw,
        origin: "meta",
        rule: "structured_package_count",
      });
    }

    const composite = titleHasExplicitComposite(titleOffer.evidence);
    if (packageContents) {
      if (composite || (totalQuantity && !quantitiesEqual(totalQuantity, packageContents))) {
        if (quantitiesEqual(totalQuantity, packageContents)) {
          evidence.push({
            field: "totalQuantity",
            raw: packageContents.raw,
            origin: "meta",
            rule: packageContents.kind === "mass" ? "structured_mass" : "structured_volume",
          });
        } else {
          // Title already named the pack contents; a disagreeing structured quantity is kept raw.
          extra.packageQuantityRaw = packageContents.raw;
          blockUnitPrice = true;
        }
      } else {
        // Kiekis pakuotėje is the purchasable package total, not a per-item size.
        totalQuantity = packageContents;
        evidence.push({
          field: "totalQuantity",
          raw: packageContents.raw,
          origin: "meta",
          rule: packageContents.kind === "mass" ? "structured_mass" : "structured_volume",
        });
      }
    }

    const usedGenericVolume =
      !packageContents &&
      trustedGenericVolume != null &&
      !composite &&
      (packageCount == null || packageCount === 1);
    if (usedGenericVolume && trustedGenericVolume) {
      // Generic Tūris is a single-product size only when no pack/composite is competing.
      itemQuantity = trustedGenericVolume;
      totalQuantity = trustedGenericVolume;
      evidence.push({
        field: "itemQuantity",
        raw: trustedGenericVolume.raw,
        origin: "meta",
        rule: "structured_volume",
      });
    } else if (genericVolumeRaw && !usedGenericVolume) {
      extra.volumeRaw = genericVolumeRaw;
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
        blockUnitPrice,
        blockPieceUnitPrice: titleOffer.mixedSetBlocked,
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
