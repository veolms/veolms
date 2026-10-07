import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatMoney,
  minorUnitsPerMajor,
  toMajorUnits,
  toMinorUnits,
} from "@veolms/contracts";

import { renderNotificationTemplate } from "../../notifications/notifications.templates.ts";

// Intl may separate the symbol from the number with a narrow no-break space.
const plain = (value: string) => value.replace(/\s/g, "");

void describe("money units", () => {
  void it("converts major to minor units per currency", () => {
    assert.equal(minorUnitsPerMajor("INR"), 100);
    assert.equal(minorUnitsPerMajor("jpy"), 1);
    assert.equal(toMinorUnits(499, "INR"), 49_900);
    assert.equal(toMinorUnits(499, "JPY"), 499);
    assert.equal(toMinorUnits(0, "INR"), 0);
  });

  void it("refuses amounts that are not whole, non-negative numbers", () => {
    assert.throws(() => toMinorUnits(4.99, "INR"));
    assert.throws(() => toMinorUnits(-1, "INR"));
    assert.throws(() => toMinorUnits(Number.NaN, "INR"));
  });

  void it("converts minor to major units for display", () => {
    assert.equal(toMajorUnits(49_900, "INR"), 499);
    assert.equal(toMajorUnits(10_050, "INR"), 100.5);
    assert.equal(toMajorUnits(499, "JPY"), 499);
  });
});

void describe("formatMoney", () => {
  void it("takes minor units by default", () => {
    // The bug this replaces: a ₹499 order rendered as ₹4.99.
    assert.equal(plain(formatMoney(49_900)), "₹499");
    assert.equal(plain(formatMoney(49_900, { currency: "INR" })), "₹499");
  });

  void it("shows decimals only when the amount has a fractional part", () => {
    assert.equal(plain(formatMoney(9_950)), "₹99.50");
    assert.equal(plain(formatMoney(10_000)), "₹100");
  });

  void it("can always or never show decimals", () => {
    assert.equal(plain(formatMoney(49_900, { decimals: "always" })), "₹499.00");
    assert.equal(plain(formatMoney(9_950, { decimals: "never" })), "₹100");
  });

  void it("formats major-unit list prices without converting them", () => {
    assert.equal(plain(formatMoney(499, { unit: "major" })), "₹499");
  });

  void it("groups in the Indian system for INR", () => {
    assert.equal(plain(formatMoney(12_450_000)), "₹1,24,500");
  });

  void it("handles zero-decimal currencies", () => {
    assert.equal(plain(formatMoney(499, { currency: "JPY" })), "¥499");
  });
});

void describe("money in notifications", () => {
  void it("renders a purchase total from the major-unit order amount", () => {
    const rendered = renderNotificationTemplate(
      "purchase.completed",
      {
        orderNumber: "ORD-1",
        totalAmount: 499,
        currency: "INR",
        itemTitles: ["Node.js Basics"],
      },
      "/orders",
    );
    assert.match(plain(rendered.inApp.body), /\(₹499\)/);
  });

  void it("renders a refund amount from the minor-unit refund amount", () => {
    const rendered = renderNotificationTemplate(
      "refund.completed",
      { orderNumber: "ORD-1", amount: 10_000, currency: "INR" },
      "/orders",
    );
    assert.match(plain(rendered.inApp.body), /^₹100wasrefunded/);
  });
});
