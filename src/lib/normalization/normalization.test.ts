import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CsvRow } from "../csv";
import { normalizeRow } from "./pipeline";
import {
  extractTitleOffer,
  parseLooseNumber,
  toCanonicalQuantity,
} from "./primitives";
import { deriveUnitPrice, selectComparablePrice } from "./price";
import { findDuplicates } from "./metrics";

/** Build a complete MKV fixture with focused per-test overrides. */
function mkvRow(overrides: Partial<CsvRow> = {}): CsvRow {
  return {
    id: "1",
    title: "",
    brand: "TEST",
    manufacturer: "",
    model: "",
    barcode: "",
    price: "10",
    final_price: "10",
    discount_price: "9",
    member_price: "8",
    category: "TVIRTINIMO MEDŽIAGOS, FURNITŪRA",
    subcategory: "",
    subsubcategory: "",
    subsubsubcategory: "",
    country_code: "LT",
    source_id: "s1",
    record_id: "r1",
    length: "",
    width: "",
    height: "",
    depth: "",
    weight: "",
    power: "",
    color: "",
    dimensions: "",
    ...overrides,
  };
}

describe("number and unit primitives", () => {
  it("treats comma as a decimal separator", () => {
    assert.equal(parseLooseNumber("2,700"), 2.7);
    assert.equal(parseLooseNumber("1,44"), 1.44);
    assert.equal(parseLooseNumber("2.5"), 2.5);
    assert.equal(parseLooseNumber("not-a-number"), null);
  });

  it("canonicalizes equivalent volume and mass units", () => {
    assert.deepEqual(toCanonicalQuantity("1000", "ml", "1000 ml"), {
      value: 1,
      unit: "L",
      kind: "volume",
      raw: "1000 ml",
    });
    assert.deepEqual(toCanonicalQuantity("0.75", "l", "0.75 L"), {
      value: 0.75,
      unit: "L",
      kind: "volume",
      raw: "0.75 L",
    });
    assert.deepEqual(toCanonicalQuantity("500", "g", "500 g"), {
      value: 0.5,
      unit: "kg",
      kind: "mass",
      raw: "500 g",
    });
  });
});

describe("composite package parsing", () => {
  it("parses quantity × count and count × quantity", () => {
    const foam = extractTitleOffer("PENOSIL 750 ml x 12 vnt.", {
      allowStandaloneVolume: false,
      allowStandaloneMass: false,
      allowPharmacyN: false,
    });
    assert.equal(foam.packageCount, 12);
    assert.equal(foam.itemQuantity?.value, 0.75);
    assert.equal(foam.itemQuantity?.unit, "L");
    assert.equal(foam.totalQuantity?.value, 9);

    const grams = extractTitleOffer("tabletės 4 x 100 g", {
      allowStandaloneVolume: false,
      allowStandaloneMass: false,
      allowPharmacyN: false,
    });
    assert.equal(grams.packageCount, 4);
    assert.equal(grams.itemQuantity?.value, 0.1);
    assert.equal(grams.totalQuantity?.value, 0.4);

    const millilitres = extractTitleOffer("ampulės 2 x 185 ml", {
      allowStandaloneVolume: false,
      allowStandaloneMass: false,
      allowPharmacyN: false,
    });
    assert.equal(millilitres.packageCount, 2);
    assert.equal(millilitres.itemQuantity?.value, 0.185);
    assert.equal(millilitres.totalQuantity?.value, 0.37);

    const catFood = extractTitleOffer("0.085 kg x 12 vnt.", {
      allowStandaloneVolume: false,
      allowStandaloneMass: false,
      allowPharmacyN: false,
    });
    assert.equal(catFood.packageCount, 12);
    assert.equal(catFood.itemQuantity?.value, 0.085);
    assert.equal(catFood.totalQuantity?.value, 1.02);
  });

  it("parses parenthetical packs such as 750ml (12 vnt)", () => {
    const foam = extractTitleOffer("Putos 750ml (12 vnt) + pistoletas", {
      allowStandaloneVolume: true,
      allowStandaloneMass: false,
      allowPharmacyN: false,
    });
    assert.equal(foam.packageCount, 12);
    assert.equal(foam.itemQuantity?.value, 0.75);
    assert.equal(foam.totalQuantity?.value, 9);
    assert.equal(foam.bundleBlocked, true);
  });

  it("leaves repeated composite components unresolved instead of selecting the first", () => {
    const set = extractTitleOffer("Rinkinys: 2 x 35 ml kremas, 3 x 35 ml muilas", {
      allowStandaloneVolume: true,
      allowStandaloneMass: false,
      allowPharmacyN: false,
    });
    assert.equal(set.packageCount, null);
    assert.equal(set.itemQuantity, null);
    assert.equal(set.totalQuantity, null);
    assert.ok(set.warnings.some((item) => item.code === "ambiguous_quantity_role"));
  });
});

describe("MKV semantic cases", () => {
  it("splits fastener dimensions from package count and prices per piece", () => {
    const product = normalizeRow(
      "MKV",
      mkvRow({ title: "Sraigtas 3.9 x 25 mm, 1000 vnt.", final_price: "20" }),
    );
    assert.equal(product.offer.packageCount, 1000);
    assert.equal(product.specifications.dimensions?.unit, "mm");
    assert.deepEqual(product.specifications.dimensions?.values, [3.9, 25]);
    assert.equal(product.offer.itemQuantity, null);
    assert.equal(product.pricing.unitPrice, 0.02);
    assert.equal(product.pricing.unitPriceUnit, "piece");
    assert.equal(product.offer.denominatorStatus, "available");
  });

  it("uses paint volume as the offer quantity, not a specification", () => {
    const product = normalizeRow(
      "MKV",
      mkvRow({
        title: "Sienų dažai 2.5 L",
        category: "DAŽAI IR PARUOŠIMO MEDŽIAGOS",
        final_price: "10",
      }),
    );
    assert.equal(product.offer.itemQuantity?.value, 2.5);
    assert.equal(product.offer.itemQuantity?.unit, "L");
    assert.equal(product.pricing.unitPrice, 4);
    assert.equal(product.pricing.unitPriceUnit, "L");
  });

  it("treats bathtub dimensions as identity and does not invent a unit price", () => {
    const product = normalizeRow(
      "MKV",
      mkvRow({
        title: "KOLO OPAL PLUS 150 x 70 cm",
        category: "SANTECHNINĖ IR VONIOS KAMBARIO ĮRANGA",
        final_price: "250",
      }),
    );
    assert.deepEqual(product.specifications.dimensions?.values, [150, 70]);
    assert.equal(product.offer.packageCount, null);
    assert.equal(product.offer.totalQuantity, null);
    assert.equal(product.pricing.unitPrice, null);
    assert.equal(product.offer.denominatorStatus, "not_applicable");
    assert.equal(product.quality.warnings.length, 0);
  });

  it("uses box area, not tile size, as the flooring denominator", () => {
    const product = normalizeRow(
      "MKV",
      mkvRow({
        title: "Plytelės 60 x 60 cm, 1,44 m2/dėž.",
        category: "GRINDŲ IR SIENŲ DANGOS",
        final_price: "25",
      }),
    );
    assert.deepEqual(product.specifications.dimensions?.values, [60, 60]);
    assert.equal(product.offer.totalQuantity?.kind, "area");
    assert.equal(product.offer.totalQuantity?.value, 1.44);
    assert.equal(product.pricing.unitPriceUnit, "m2");
  });

  it("does not treat MKV plumbing N4 as a pharmacy package", () => {
    const product = normalizeRow("MKV", mkvRow({ title: "Redukcija MECH, d40 x 20, N4" }));
    assert.equal(product.offer.packageCount, null);
  });

  it("blocks unit price for an extra bundled accessory, not for a bare plus", () => {
    const bundle = normalizeRow(
      "MKV",
      mkvRow({
        title: "PENOSIL 750 ml x 12 vnt. + pistoletas",
        category: "DAŽAI IR PARUOŠIMO MEDŽIAGOS",
        final_price: "40",
      }),
    );
    assert.equal(bundle.offer.packageCount, 12);
    assert.equal(bundle.offer.denominatorStatus, "blocked_bundle");
    assert.equal(bundle.pricing.unitPrice, null);
    assert.ok(bundle.quality.warnings.some((item) => item.code === "bundle_with_extra_item"));

    const storage = normalizeRow(
      "MKV",
      mkvRow({
        title: "Telefonas 4+128GB",
        category: "BUITINĖ TECHNIKA",
        final_price: "199",
      }),
    );
    assert.equal(storage.offer.denominatorStatus, "not_applicable");
    assert.equal(
      storage.quality.warnings.some((item) => item.code === "bundle_with_extra_item"),
      false,
    );
  });

  it("keeps mass unset when a piece count and mass are not explicitly linked", () => {
    const product = normalizeRow(
      "MKV",
      mkvRow({
        title: "Maistas graužikams, 2 vnt, 130g",
        category: "GYVŪNŲ PREKĖS",
        subcategory: "Gyvūnų maistas (paukščių, graužikų maistas, žuvų pašarai)",
        final_price: "3",
      }),
    );
    assert.equal(product.offer.packageCount, 2);
    assert.equal(product.offer.itemQuantity, null);
    assert.ok(product.quality.warnings.some((item) => item.code === "ambiguous_quantity_role"));
  });

  it("does not price capacities, rates, density, or compatibility limits as contents", () => {
    const roofBox = normalizeRow(
      "MKV",
      mkvRow({
        title: "Automobilių stogo bagažinė, 400 L, atlaikomas svoris 75 kg",
        category: "AUTOMOBILIŲ PREKĖS",
        subcategory: "Auto aksesuarai",
      }),
    );
    assert.equal(roofBox.offer.totalQuantity, null);
    assert.equal(roofBox.pricing.unitPrice, null);

    const sheet = normalizeRow(
      "MKV",
      mkvRow({
        title: "Apsauginis kartonas, 100 g/m2, 1 m x 20 m",
        category: "DAŽAI IR PARUOŠIMO MEDŽIAGOS",
        subcategory: "Paruošimo medžiagos",
        subsubcategory: "Juostelės, plėvelės",
      }),
    );
    assert.equal(sheet.offer.totalQuantity, null);
    assert.equal(sheet.pricing.unitPrice, null);
  });

  it("rejects adjustable and multi-size dimensions", () => {
    const range = normalizeRow(
      "MKV",
      mkvRow({ title: "Durų stakta 100-140 x 91 x 2108 mm" }),
    );
    assert.equal(range.specifications.dimensions, null);
    assert.ok(range.quality.warnings.some((item) => item.code === "ambiguous_dimensions"));

    const set = normalizeRow(
      "MKV",
      mkvRow({ title: "Vazonų rinkinys 23 x 18 cm, 19 x 16 cm, 15 x 14 cm" }),
    );
    assert.equal(set.specifications.dimensions, null);
    assert.ok(set.quality.warnings.some((item) => item.code === "ambiguous_dimensions"));
  });
});

describe("pricing policy", () => {
  it("uses final_price then price, and never discount_price or member_price", () => {
    const fromFinal = selectComparablePrice({
      price: 12,
      finalPrice: 10,
      discountPrice: 7,
      memberPrice: 6,
    });
    assert.deepEqual(fromFinal, { value: 10, field: "final_price" });

    const fromPrice = selectComparablePrice({
      price: 12,
      finalPrice: null,
      discountPrice: 7,
      memberPrice: 6,
    });
    assert.deepEqual(fromPrice, { value: 12, field: "price" });

    const missing = selectComparablePrice({
      price: null,
      finalPrice: 0,
      discountPrice: 7,
      memberPrice: 6,
    });
    assert.deepEqual(missing, { value: null, field: null });
  });

  it("refuses to price from a non-available denominator", () => {
    const result = deriveUnitPrice(10, {
      packageCount: 2,
      itemQuantity: null,
      totalQuantity: null,
      denominatorStatus: "not_applicable",
    });
    assert.equal(result.unitPrice, null);
  });

  it("records comparable-price evidence on the normalized row", () => {
    const product = normalizeRow(
      "MKV",
      mkvRow({ title: "Kibiras", final_price: "", price: "15", discount_price: "9" }),
    );
    assert.equal(product.pricing.comparablePrice, 15);
    assert.equal(product.pricing.comparablePriceField, "price");
    assert.equal(product.pricing.discountPrice, 9);
    assert.ok(product.evidence.some((item) => item.rule === "comparable_price"));
  });
});

describe("SNK, TOP, and BNU adapters", () => {
  it("prefers SNK structured pack count and records title disagreement", () => {
    const product = normalizeRow("SNK", {
      title: "Kaištis 12 vnt.",
      brand: "Fischer",
      barcode: "1234567890123",
      model: "DuoPower",
      price: "5",
      final_price: "5",
      discount_price: "4",
      member_price: "",
      category: "Tvirtinimas",
      country_code: "LT",
      source_id: "snk-1",
      record_id: "r1",
      meta: JSON.stringify({ extra: { "Vienetai pakuotėje": "8" } }),
    });
    assert.equal(product.offer.packageCount, 8);
    assert.ok(product.quality.warnings.some((item) => item.code === "title_meta_package_mismatch"));
    assert.ok(product.evidence.some((item) => item.rule === "structured_package_count"));
  });

  it("uses generic SNK Tūris only with title agreement and non-capacity context", () => {
    const cleaner = normalizeRow("SNK", {
      title: "Kilimų valiklis 1.5 l",
      final_price: "15",
      meta: JSON.stringify({ extra: { "Tūris": "1.5 l" } }),
    });
    assert.equal(cleaner.offer.totalQuantity?.value, 1.5);
    assert.equal(cleaner.pricing.unitPriceUnit, "L");

    const bucket = normalizeRow("SNK", {
      title: "Grindų plovimo kibiras 10 l",
      final_price: "13",
      meta: JSON.stringify({ extra: { "Tūris": "10 l" } }),
    });
    assert.equal(bucket.offer.totalQuantity, null);
    assert.equal(bucket.pricing.unitPrice, null);
    assert.equal(bucket.specifications.extra.volumeRaw, "10 l");
  });

  it("keeps TOP identity useful when no pricing denominator exists", () => {
    const product = normalizeRow("TOP", {
      title: "Šaldytuvas SAMSUNG RB34T600ESA",
      brand: "SAMSUNG",
      model: "RB34T600ESA",
      barcode: "8806092080124",
      price: "499",
      final_price: "499",
      category: "Šaldymas",
      country_code: "LT",
      source_id: "top-1",
      record_id: "r1",
      dimensions: "1855 x 595 x 658 mm",
    });
    assert.equal(product.identity.barcode, "8806092080124");
    assert.equal(product.identity.model, "RB34T600ESA");
    assert.deepEqual(product.specifications.dimensions?.values, [1855, 595, 658]);
    assert.equal(product.pricing.unitPrice, null);
    assert.equal(product.offer.denominatorStatus, "not_applicable");
  });

  it("separates BNU strength from package count", () => {
    const product = normalizeRow("BNU", {
      title: "Paracetamol 500 mg N20",
      manufacturer: "ACME",
      barcode: "4770123456789",
      form: "tabletės",
      active_substance: "paracetamol",
      active_substance_strength: "500 mg",
      amount_in_package: "20",
      quantity: "20",
      price: "2.00",
      final_price: "2.00",
      category: "Analgetikai",
      country_code: "LV",
      source_id: "bnu-1",
      record_id: "r1",
    });
    assert.equal(product.specifications.strength?.value, 500);
    assert.equal(product.specifications.strength?.unit, "mg");
    assert.equal(product.offer.packageCount, 20);
    assert.equal(product.pricing.unitPrice, 0.1);
    assert.equal(product.pricing.unitPriceUnit, "piece");
    assert.equal(product.specifications.extra.form, "tabletės");
  });

  it("does not map non-numeric BNU amount_in_package to package count", () => {
    const product = normalizeRow("BNU", {
      title: "KORVALOLS N 25 ml",
      manufacturer: "X",
      barcode: "1",
      amount_in_package: "25 ml",
      final_price: "4",
      country_code: "LV",
      source_id: "bnu-2",
      record_id: "r2",
    });
    assert.equal(product.offer.packageCount, null);
    assert.ok(product.quality.warnings.some((item) => item.code === "structured_package_not_numeric"));
  });

  it("preserves compound BNU strength when it cannot be flattened", () => {
    const product = normalizeRow("BNU", {
      title: "LARYXIN pastilės N24",
      active_substance_strength: "5MG/1MG",
      amount_in_package: "24",
      final_price: "5",
    });
    assert.equal(product.specifications.strength, null);
    assert.equal(product.specifications.extra.activeSubstanceStrengthRaw, "5MG/1MG");
    assert.ok(product.evidence.some((item) => item.rule === "preserve_unmapped_strength"));
  });

  it("does not mistake age markers for bundles but blocks explicit N-count additions", () => {
    const age = normalizeRow("BNU", {
      title: "LIVOL Multi Herba 50+ N100",
      amount_in_package: "100",
      final_price: "10",
    });
    assert.equal(age.offer.denominatorStatus, "available");
    assert.equal(age.pricing.unitPrice, 0.1);

    const bundle = normalizeRow("BNU", {
      title: "Komplektas N30 + N30",
      amount_in_package: "30",
      final_price: "10",
    });
    assert.equal(bundle.offer.denominatorStatus, "blocked_bundle");
    assert.equal(bundle.pricing.unitPrice, null);
  });
});

describe("dataset integrity metrics", () => {
  it("uses record_id to distinguish rows that reuse source_id", () => {
    const first = normalizeRow("MKV", mkvRow({ source_id: "same", record_id: "1" }));
    const second = normalizeRow("MKV", mkvRow({ source_id: "same", record_id: "2" }));
    const repeated = normalizeRow("MKV", mkvRow({ source_id: "same", record_id: "2" }));
    const duplicates = findDuplicates([first, second, repeated]);
    assert.equal(duplicates.extraRows, 1);
    assert.equal(duplicates.uniqueDuplicateKeys, 1);
  });
});
