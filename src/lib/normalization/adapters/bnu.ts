import type { CsvRow } from "../../csv";
import {
  emptyToNull,
  extractTitleOffer,
  isDiscretePackageCount,
  parsePharmacyNCounts,
  parseQuantityFromText,
  parseStrengthFromText,
  reconcileStructuredPackageCount,
} from "../primitives";
import type { AdapterDraft, SourceAdapter } from "./types";
import { copyNativeFields, text } from "./types";

/** Map BNU pharmacy fields onto the common model without treating mg as a pack. */
export const bnuAdapter: SourceAdapter = {
  source: "BNU",
  extract(row: CsvRow): AdapterDraft {
    const title = row.title ?? "";

    // identity
    const identity = {
      source: "BNU" as const,
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
      allowBareCountXQuantity: false,
    });

    const extra: Record<string, string> = {};
    const form = text(row, "form");
    const activeSubstance = text(row, "active_substance");
    const strengthRaw = text(row, "active_substance_strength");
    const amountRaw = text(row, "amount_in_package");
    const quantityRaw = text(row, "quantity");
    if (form) extra.form = form;
    if (activeSubstance) extra.activeSubstance = activeSubstance;
    if (strengthRaw) extra.activeSubstanceStrengthRaw = strengthRaw;
    if (amountRaw) extra.amountInPackageRaw = amountRaw;
    if (quantityRaw) extra.quantityRaw = quantityRaw;
    copyNativeFields(row, extra);

    const warnings = [...titleOffer.warnings];
    const evidence = [...titleOffer.evidence];

    const structuredCount = isDiscretePackageCount(amountRaw);
    let packageCount = titleOffer.packageCount;
    let packageCountRaw = titleOffer.packageCountRaw;
    let itemQuantity = titleOffer.itemQuantity;
    let totalQuantity = titleOffer.totalQuantity;
    let blockUnitPrice = false;

    if (structuredCount != null && amountRaw) {
      const reconciled = reconcileStructuredPackageCount(
        {
          packageCount: titleOffer.packageCount,
          itemQuantity: titleOffer.itemQuantity,
          totalQuantity: titleOffer.totalQuantity,
        },
        structuredCount,
        amountRaw,
      );
      packageCount = reconciled.packageCount;
      packageCountRaw = reconciled.packageCountRaw;
      itemQuantity = reconciled.itemQuantity;
      totalQuantity = reconciled.totalQuantity;
      blockUnitPrice = reconciled.blockUnitPrice;
      if (reconciled.mismatched) {
        warnings.push({
          code: "title_n_vs_amount_mismatch",
          message: `Title pack ${titleOffer.packageCount} disagrees with amount_in_package=${structuredCount}.`,
        });
      }
      evidence.push({
        field: "packageCount",
        raw: amountRaw,
        origin: "column",
        rule: "structured_package_count",
      });
    } else if (amountRaw) {
      // Strong evidence exists, but it is not a clean discrete count.
      warnings.push({
        code: "structured_package_not_numeric",
        message: "amount_in_package is present but is not a discrete package count.",
      });
      const nCounts = parsePharmacyNCounts(title);
      if (packageCount == null && nCounts.length === 1) {
        packageCount = nCounts[0].count;
        packageCountRaw = nCounts[0].raw;
        evidence.push({
          field: "packageCount",
          raw: nCounts[0].raw,
          origin: "title",
          rule: "pharmacy_n_fallback",
        });
      }
    } else {
      const nCounts = parsePharmacyNCounts(title);
      if (packageCount == null && nCounts.length === 1) {
        packageCount = nCounts[0].count;
        packageCountRaw = nCounts[0].raw;
        evidence.push({ field: "packageCount", raw: nCounts[0].raw, origin: "title", rule: "pharmacy_n" });
      }
    }

    const titleN = parsePharmacyNCounts(title);
    if (structuredCount != null && titleN.length === 1 && titleN[0].count !== structuredCount) {
      warnings.push({
        code: "title_n_vs_amount_mismatch",
        message: `Title N=${titleN[0].count} disagrees with amount_in_package=${structuredCount}.`,
      });
    }

    const structuredStrength = parseStrengthFromText(strengthRaw);
    const strength = structuredStrength ?? titleOffer.strength;
    if (structuredStrength && strengthRaw) {
      evidence.push({
        field: "strength",
        raw: strengthRaw,
        origin: "column",
        rule: "structured_strength",
      });
    } else if (strengthRaw) {
      // Compound strengths and concentrations are valid identity facts even though the scalar slot cannot hold them.
      evidence.push({
        field: "specifications.extra.activeSubstanceStrengthRaw",
        raw: strengthRaw,
        origin: "column",
        rule: "preserve_unmapped_strength",
      });
    }

    const itemFromQuantity = parseQuantityFromText(quantityRaw);
    if (itemFromQuantity && (packageCount == null || packageCount === 1) && !itemQuantity) {
      // Use structured quantity as the offer size only when it is not competing with a multi-item pack.
      itemQuantity = itemFromQuantity;
      totalQuantity = itemFromQuantity;
      evidence.push({
        field: "itemQuantity",
        raw: itemFromQuantity.raw,
        origin: "column",
        rule: "structured_quantity",
      });
    }

    if (identity.manufacturer) {
      evidence.push({
        field: "manufacturer",
        raw: identity.manufacturer,
        origin: "column",
        rule: "identity_column",
      });
    }
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
        strength,
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
