import assert from "node:assert/strict";
import test from "node:test";
import { findDeliveryRateTier, roundedDeliveryDistance } from "../src/lib/delivery-rates.ts";

test("standard delivery tariff maps distance bands to the expected Boliviano fee", () => {
  assert.equal(findDeliveryRateTier(0.4)?.deliveryFee, 10);
  assert.equal(findDeliveryRateTier(1)?.deliveryFee, 12);
  assert.equal(findDeliveryRateTier(3)?.deliveryFee, 15);
  assert.equal(findDeliveryRateTier(4.2)?.deliveryFee, 15);
  assert.equal(findDeliveryRateTier(8.5)?.deliveryFee, 22);
  assert.equal(findDeliveryRateTier(10.3)?.deliveryFee, 27);
  assert.equal(findDeliveryRateTier(14.9)?.deliveryFee, 37);
  assert.equal(findDeliveryRateTier(15), undefined);
});

test("delivery distance is rounded to one decimal before choosing a tier", () => {
  assert.equal(roundedDeliveryDistance(2.949), 2.9);
  assert.equal(roundedDeliveryDistance(2.951), 3);
  assert.equal(findDeliveryRateTier(2.951)?.deliveryFee, 15);
});
