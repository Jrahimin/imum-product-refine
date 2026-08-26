import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CsvRow } from "../csv";
import { normalizeRow } from "./pipeline";
import {
  extractTitleOffer,
  parseLooseNumber,
  reconcileStructuredPackageCount,
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

const TITLE_OFF = {
  allowStandaloneVolume: false,
  allowStandaloneMass: false,
  allowPharmacyN: false,
  allowBareCountXQuantity: false,
} as const;

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
  it("parses quantity × count with an explicit vnt/pcs/gab token", () => {
    const foam = extractTitleOffer("PENOSIL 750 ml x 12 vnt.", TITLE_OFF);
    assert.equal(foam.packageCount, 12);
    assert.equal(foam.itemQuantity?.value, 0.75);
    assert.equal(foam.itemQuantity?.unit, "L");
    assert.equal(foam.totalQuantity?.value, 9);

    const catFood = extractTitleOffer("0.085 kg x 12 vnt.", TITLE_OFF);
    assert.equal(catFood.packageCount, 12);
    assert.equal(catFood.itemQuantity?.value, 0.085);
    assert.equal(catFood.totalQuantity?.value, 1.02);
  });

  it("does not trust bare count × quantity without an adapter opt-in", () => {
    const grams = extractTitleOffer("tabletės 4 x 100 g", TITLE_OFF);
    assert.equal(grams.packageCount, null);
    assert.equal(grams.itemQuantity, null);
    assert.equal(grams.totalQuantity, null);

    const millilitres = extractTitleOffer("ampulės 2 x 185 ml", TITLE_OFF);
    assert.equal(millilitres.packageCount, null);
    assert.equal(millilitres.itemQuantity, null);
  });

  it("parses bare count × quantity only when the adapter opts in", () => {
    const grams = extractTitleOffer("tabletės 4 x 100 g", {
      ...TITLE_OFF,
      allowBareCountXQuantity: true,
    });
    assert.equal(grams.packageCount, 4);
    assert.equal(grams.itemQuantity?.value, 0.1);
    assert.equal(grams.totalQuantity?.value, 0.4);
  });

  it("parses parenthetical packs such as 750ml (12 vnt)", () => {
    const foam = extractTitleOffer("Putos 750ml (12 vnt) + pistoletas", {
      ...TITLE_OFF,
      allowStandaloneVolume: true,
    });
    assert.equal(foam.packageCount, 12);
    assert.equal(foam.itemQuantity?.value, 0.75);
    assert.equal(foam.totalQuantity?.value, 9);
    assert.equal(foam.bundleBlocked, true);
  });

  it("leaves repeated composite components unresolved instead of selecting the first", () => {
    const set = extractTitleOffer("Rinkinys: 2 x 35 ml kremas, 3 x 35 ml muilas", {
      ...TITLE_OFF,
      allowStandaloneVolume: true,
      allowBareCountXQuantity: true,
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

  it("uses bare count × quantity for pet-food packs, not bowl capacities", () => {
    const food = normalizeRow(
      "MKV",
      mkvRow({
        title: "Šunų ėdalas CESAR, višt.ir mork, konservuotas, 4x100 g",
        category: "GYVŪNŲ PREKĖS",
        subcategory: "Šunų maistas (sausas ir konservuotas, vitaminai)",
        final_price: "4",
      }),
    );
    assert.equal(food.offer.packageCount, 4);
    assert.equal(food.offer.itemQuantity?.value, 0.1);
    assert.equal(food.offer.totalQuantity?.value, 0.4);
    assert.equal(food.pricing.unitPrice, 10);
    assert.equal(food.pricing.unitPriceUnit, "kg");

    const bowl = normalizeRow(
      "MKV",
      mkvRow({
        title: "Dvigubas dubenėlis, metalinis, su stovu, 2 x 550ml",
        category: "GYVŪNŲ PREKĖS",
        subcategory: "Gyvūnų aksesuarai",
        final_price: "12",
      }),
    );
    assert.equal(bowl.offer.packageCount, null);
    assert.equal(bowl.offer.totalQuantity, null);
    assert.equal(bowl.pricing.unitPrice, null);
  });

  it("does not treat metal-profile L tokens as litre packs", () => {
    const pipe = normalizeRow(
      "MKV",
      mkvRow({
        title: "Vamzdis, 40 x 40 x 2 L - 2 m, kvadratinis",
        category: "STATYBINĖS MEDŽIAGOS",
        subcategory: "Metalo gaminiai",
        final_price: "15",
      }),
    );
    assert.equal(pipe.offer.packageCount, null);
    assert.equal(pipe.offer.totalQuantity, null);
    assert.equal(pipe.pricing.unitPrice, null);
  });

  it("does not price mixed rinkinys/komplektas sets per piece", () => {
    const mixed = normalizeRow(
      "MKV",
      mkvRow({
        title: "Sodo įrankių komplektas iš 3 dalių TRAMONTINA 78107/809",
        final_price: "15",
      }),
    );
    assert.equal(mixed.pricing.unitPrice, null);

    const countedSet = normalizeRow(
      "MKV",
      mkvRow({
        title: "Šlifavimo lapelių rinkinys BOSCH, D 125 mm, K 40, 10 vnt.",
        final_price: "10",
      }),
    );
    assert.equal(countedSet.offer.packageCount, 10);
    assert.equal(countedSet.pricing.unitPrice, null);
    assert.equal(countedSet.offer.denominatorStatus, "unavailable");
    assert.ok(countedSet.quality.warnings.some((item) => item.code === "mixed_item_set"));

    const homogeneous = normalizeRow(
      "MKV",
      mkvRow({
        title: "PENOSIL 750 ml x 12 vnt. rinkinys",
        category: "DAŽAI IR PARUOŠIMO MEDŽIAGOS",
        final_price: "36",
      }),
    );
    assert.equal(homogeneous.offer.packageCount, 12);
    assert.equal(homogeneous.offer.totalQuantity?.value, 9);
    assert.equal(homogeneous.pricing.unitPrice, 4);
    assert.equal(homogeneous.pricing.unitPriceUnit, "L");
  });

  it("preserves source-native lookup fields without using them for pricing", () => {
    const product = normalizeRow(
      "MKV",
      mkvRow({
        title: "Kibiras",
        product_code: "MKV-99",
        internal_product_code: "INT-1",
        in_stock: "1",
        url: "https://example.test/p/99",
      }),
    );
    assert.equal(product.specifications.extra.productCode, "MKV-99");
    assert.equal(product.specifications.extra.internalProductCode, "INT-1");
    assert.equal(product.specifications.extra.inStock, "1");
    assert.equal(product.specifications.extra.url, "https://example.test/p/99");
    assert.equal(product.pricing.unitPrice, null);
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
  it("prefers SNK structured pack count, records disagreement, and blocks unit price", () => {
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
    assert.equal(product.pricing.unitPrice, null);
    assert.equal(product.offer.denominatorStatus, "unavailable");
    assert.ok(product.quality.warnings.some((item) => item.code === "title_meta_package_mismatch"));
    assert.ok(product.evidence.some((item) => item.rule === "structured_package_count"));
  });

  it("keeps structured pack count and blocks unit price when it disagrees with a title composite", () => {
    const product = normalizeRow("SNK", {
      title: "PENOSIL 750 ml x 12 vnt.",
      final_price: "36",
      meta: JSON.stringify({ extra: { "Vienetai pakuotėje": "8" } }),
    });
    assert.equal(product.offer.packageCount, 8);
    assert.equal(product.offer.itemQuantity?.value, 0.75);
    assert.equal(product.offer.totalQuantity, null);
    assert.equal(product.pricing.unitPrice, null);
    assert.ok(product.quality.warnings.some((item) => item.code === "title_meta_package_mismatch"));
  });

  it("clears an inconsistent derived total when item × count cannot be recomputed safely", () => {
    const result = reconcileStructuredPackageCount(
      {
        packageCount: 12,
        itemQuantity: { value: 0.75, unit: "L", kind: "volume", raw: "750 ml" },
        totalQuantity: { value: 1.44, unit: "m2", kind: "area", raw: "1,44 m2/dėž." },
      },
      8,
      "8",
    );
    assert.equal(result.mismatched, true);
    assert.equal(result.blockUnitPrice, true);
    assert.equal(result.itemQuantity, null);
    assert.equal(result.totalQuantity, null);
    assert.equal(result.packageCount, 8);
  });

  it("maps SNK Kiekis pakuotėje to totalQuantity and ignores generic Svoris", () => {
    const cement = normalizeRow("SNK", {
      title: "Pilkas cementas Rocket M800, 42.5 R, 35 kg",
      final_price: "7",
      meta: JSON.stringify({ extra: { "Kiekis pakuotėje, kg": "35" } }),
    });
    assert.equal(cement.offer.itemQuantity, null);
    assert.equal(cement.offer.totalQuantity?.value, 35);
    assert.equal(cement.offer.totalQuantity?.unit, "kg");
    assert.equal(cement.pricing.unitPriceUnit, "kg");
    assert.ok(cement.evidence.some((item) => item.rule === "structured_mass"));

    const glue = normalizeRow("SNK", {
      title: "Klijai parketo Kiilto MS Silex, 10 l, balta sp.",
      final_price: "40",
      meta: JSON.stringify({ extra: { Svoris: "17 kg", "Prekės tipas": "Klijai" } }),
    });
    assert.equal(glue.offer.totalQuantity, null);
    assert.equal(glue.pricing.unitPrice, null);
  });

  it("does not let SNK structured or generic volume overwrite a title composite", () => {
    const agreeing = normalizeRow("SNK", {
      title: "PENOSIL 750 ml x 12 vnt.",
      final_price: "36",
      meta: JSON.stringify({ extra: { "Kiekis pakuotėje, l": "9" } }),
    });
    assert.equal(agreeing.offer.packageCount, 12);
    assert.equal(agreeing.offer.itemQuantity?.value, 0.75);
    assert.equal(agreeing.offer.totalQuantity?.value, 9);
    assert.equal(agreeing.pricing.unitPrice, 4);

    const disagreeing = normalizeRow("SNK", {
      title: "PENOSIL 750 ml x 12 vnt.",
      final_price: "36",
      meta: JSON.stringify({ extra: { "Kiekis pakuotėje, l": "0.75", Tūris: "0.75 l" } }),
    });
    assert.equal(disagreeing.offer.itemQuantity?.value, 0.75);
    assert.equal(disagreeing.offer.totalQuantity?.value, 9);
    assert.equal(disagreeing.pricing.unitPrice, null);
    assert.equal(disagreeing.specifications.extra.packageQuantityRaw, "0.75");
    assert.equal(disagreeing.specifications.extra.volumeRaw, "0.75 l");
  });

  it("uses generic SNK Tūris only as a single-product quantity", () => {
    const cleaner = normalizeRow("SNK", {
      title: "Kilimų valiklis 1.5 l",
      final_price: "15",
      meta: JSON.stringify({ extra: { "Tūris": "1.5 l" } }),
    });
    assert.equal(cleaner.offer.itemQuantity?.value, 1.5);
    assert.equal(cleaner.offer.totalQuantity?.value, 1.5);
    assert.equal(cleaner.pricing.unitPriceUnit, "L");

    const packed = normalizeRow("SNK", {
      title: "Kilimų valiklis 1.5 l, 12 vnt.",
      final_price: "15",
      meta: JSON.stringify({ extra: { "Tūris": "1.5 l" } }),
    });
    assert.equal(packed.offer.packageCount, 12);
    assert.equal(packed.offer.totalQuantity, null);
    assert.equal(packed.pricing.unitPriceUnit, "piece");
    assert.equal(packed.specifications.extra.volumeRaw, "1.5 l");

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

  it("blocks BNU unit price when amount_in_package disagrees with the title pack", () => {
    const product = normalizeRow("BNU", {
      title: "Paracetamol 500 mg N20",
      amount_in_package: "24",
      final_price: "2.00",
    });
    assert.equal(product.offer.packageCount, 24);
    assert.equal(product.pricing.unitPrice, null);
    assert.equal(product.offer.denominatorStatus, "unavailable");
    assert.ok(product.quality.warnings.some((item) => item.code === "title_n_vs_amount_mismatch"));
  });
});

describe("dataset integrity metrics", () => {
  it("separates exact repeated records from reused source_id within a market", () => {
    const first = normalizeRow("MKV", mkvRow({ source_id: "same", record_id: "1", country_code: "LT" }));
    const second = normalizeRow("MKV", mkvRow({ source_id: "same", record_id: "2", country_code: "LT" }));
    const repeated = normalizeRow("MKV", mkvRow({ source_id: "same", record_id: "2", country_code: "LT" }));
    const otherMarket = normalizeRow("MKV", mkvRow({ source_id: "same", record_id: "1", country_code: "LV" }));
    const duplicates = findDuplicates([first, second, repeated, otherMarket]);
    assert.equal(duplicates.exactRepeatedRecord.extraRows, 1);
    assert.equal(duplicates.exactRepeatedRecord.uniqueDuplicateKeys, 1);
    assert.equal(duplicates.repeatedSourceId.extraRows, 2);
    assert.equal(duplicates.repeatedSourceId.uniqueDuplicateKeys, 1);
  });
});
