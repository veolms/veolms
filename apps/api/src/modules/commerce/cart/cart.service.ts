import crypto from "node:crypto";
import type { CartItemInput, CartResponse, CartItem } from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import { AppError } from "../../../lib/errors.ts";
import { coverageOf, coverageOverlaps } from "../shared/open-orders.ts";
import * as cartRepo from "./cart.repository.ts";
import * as courseRepo from "../../courses/course/course.repository.ts";
import * as bundleRepo from "../bundles/bundle.repository.ts";
import {
  createPricingService,
  type PricingService,
} from "../pricing/pricing.service.ts";

export interface CartService {
  getOrCreateCart(userId: string): Promise<{ id: string; user_id: string }>;
  getActiveCart(userId: string): Promise<CartResponse>;
  addItem(userId: string, item: CartItemInput): Promise<CartResponse>;
  removeItem(userId: string, itemId: string): Promise<CartResponse>;
  clearCart(userId: string): Promise<CartResponse>;
}

export function createCartService({
  database,
  pricingService = createPricingService({ database }),
}: {
  database: Executor;
  pricingService?: PricingService;
}): CartService {
  async function getOrCreateCart(userId: string) {
    let cart = await cartRepo.findCartByUserId(database, userId);
    if (!cart) {
      cart = await cartRepo.createCart(database, {
        id: crypto.randomUUID(),
        user_id: userId,
      });
    }
    return cart;
  }

  async function getActiveCart(userId: string): Promise<CartResponse> {
    const cart = await getOrCreateCart(userId);
    const rawItems = await cartRepo.listCartItemsByCartId(database, cart.id);

    if (rawItems.length === 0) {
      return {
        id: cart.id,
        userId,
        items: [],
        itemCount: 0,
        subtotalAmount: 0,
        currency: "INR",
        updatedAt: new Date(),
      };
    }

    const pricingInputs: CartItemInput[] = rawItems.map((it) => ({
      itemType: it.item_type,
      courseId: it.course_id ?? undefined,
      bundleId: it.bundle_id ?? undefined,
    }));

    // Attempt pricing — degrade gracefully if an item became unavailable.
    let pricingItems: Array<{ title: string; unitPrice: number } | undefined> =
      [];
    let subtotalAmount = 0;
    let currency = "INR";

    try {
      const { pricing } = await pricingService.calculatePricing({
        userId,
        items: pricingInputs,
      });
      pricingItems = pricing.items;
      subtotalAmount = pricing.subtotalAmount;
      currency = pricing.currency;
    } catch (err) {
      if (!(err instanceof AppError)) {
        // Not a known business-rule rejection — a genuine bug or infra
        // failure (DB blip, a mapping error) must not be silently swallowed
        // as "item unavailable" and shown to the customer as a ₹0 cart.
        // Only AppError-typed failures (unpublished course, already owned,
        // bundle unavailable, mixed currency, etc.) degrade gracefully
        // below; anything else propagates as a real error.
        throw err;
      }
      // Pricing failed for a business reason (e.g., a course was unpublished).
      // One item that can no longer be bought used to blank the whole cart to
      // zero, so each is priced on its own: the others keep their price and
      // only the unavailable one shows none.
      pricingItems = [];
      subtotalAmount = 0;
      for (const input of pricingInputs) {
        try {
          const { pricing } = await pricingService.calculatePricing({
            userId,
            items: [input],
          });
          pricingItems.push(pricing.items[0]);
          subtotalAmount += pricing.subtotalAmount;
          currency = pricing.currency;
        } catch (itemError) {
          if (!(itemError instanceof AppError)) throw itemError;
          pricingItems.push(undefined);
        }
      }
    }

    const enrichedItems: CartItem[] = [];

    // Two lookups for the whole cart, not one per item.
    const [courseRows, bundleRows] = await Promise.all([
      courseRepo.findCoursesByIds(
        database,
        rawItems.flatMap((it) =>
          it.item_type === "course" && it.course_id ? [it.course_id] : [],
        ),
      ),
      bundleRepo.findBundlesByIds(
        database,
        rawItems.flatMap((it) =>
          it.item_type === "bundle" && it.bundle_id ? [it.bundle_id] : [],
        ),
      ),
    ]);
    const coursesById = new Map(courseRows.map((row) => [row.id, row]));
    const bundlesById = new Map(bundleRows.map((row) => [row.id, row]));

    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i]!;
      const calculated = pricingItems[i];

      let slug = "";
      let thumbnailMediaId: string | null | undefined = null;

      if (raw.item_type === "course" && raw.course_id) {
        const course = coursesById.get(raw.course_id);
        slug = course?.slug ?? "";
        thumbnailMediaId = course?.thumbnail_media_id;
      } else if (raw.item_type === "bundle" && raw.bundle_id) {
        const bundle = bundlesById.get(raw.bundle_id);
        slug = bundle?.slug ?? "";
        thumbnailMediaId = bundle?.thumbnail_media_id;
      }

      enrichedItems.push({
        id: raw.id,
        cartId: raw.cart_id,
        itemType: raw.item_type,
        courseId: raw.course_id,
        bundleId: raw.bundle_id,
        title: calculated?.title ?? "Course",
        slug,
        thumbnailMediaId,
        unitPrice: calculated?.unitPrice ?? 0,
        currency,
        createdAt: raw.created_at,
      });
    }

    return {
      id: cart.id,
      userId,
      items: enrichedItems,
      itemCount: enrichedItems.length,
      subtotalAmount,
      currency,
      updatedAt: new Date(),
    };
  }

  async function addItem(
    userId: string,
    item: CartItemInput,
  ): Promise<CartResponse> {
    if (item.itemType === "quiz") {
      throw new AppError(
        400,
        "CART_QUIZ_UNSUPPORTED",
        "Quizzes are purchased directly, not through the cart.",
      );
    }
    const cart = await getOrCreateCart(userId);

    // 1. Check for duplicate cart item in student's active cart
    const existing = await cartRepo.findCartItem(database, {
      cart_id: cart.id,
      item_type: item.itemType,
      course_id: item.courseId,
      bundle_id: item.bundleId,
    });

    if (existing) {
      throw CommerceErrors.CART_ITEM_ALREADY_EXISTS();
    }

    // 2. Validate course/bundle purchasability and ownership via pricing engine
    await pricingService.calculatePricing({
      userId,
      items: [item],
    });

    // 3. A course already in the cart, on its own or inside a bundle, would
    //    be paid for twice. Checkout refuses such a cart; refusing it here
    //    says so while the buyer can still see which item it was.
    const cartItems = await cartRepo.listCartItemsByCartId(database, cart.id);
    const bundleCourses = await bundleRepo.listBundleCoursesForBundleIds(
      database,
      [
        ...cartItems.flatMap((it) => (it.bundle_id ? [it.bundle_id] : [])),
        ...(item.bundleId ? [item.bundleId] : []),
      ],
    );
    const adding = coverageOf(
      [{ itemType: item.itemType, itemId: item.courseId ?? item.bundleId }],
      bundleCourses,
    );
    const inCart = coverageOf(
      cartItems.map((it) => ({
        itemType: it.item_type,
        itemId: it.course_id ?? it.bundle_id,
      })),
      bundleCourses,
    );
    if (coverageOverlaps(adding, inCart)) {
      throw CommerceErrors.CART_ITEMS_OVERLAP();
    }

    // 4. Persist item to cart
    await cartRepo.insertCartItem(database, {
      id: crypto.randomUUID(),
      cart_id: cart.id,
      item_type: item.itemType,
      course_id: item.courseId,
      bundle_id: item.bundleId,
    });

    return await getActiveCart(userId);
  }

  async function removeItem(
    userId: string,
    itemId: string,
  ): Promise<CartResponse> {
    const cart = await getOrCreateCart(userId);
    const result = await cartRepo.deleteCartItem(database, cart.id, itemId);

    if (!result || Number(result.numDeletedRows ?? 0) === 0) {
      throw CommerceErrors.CART_ITEM_NOT_FOUND();
    }

    return await getActiveCart(userId);
  }

  async function clearCart(userId: string): Promise<CartResponse> {
    const cart = await getOrCreateCart(userId);
    await cartRepo.clearCartItems(database, cart.id);
    return await getActiveCart(userId);
  }

  return {
    getOrCreateCart,
    getActiveCart,
    addItem,
    removeItem,
    clearCart,
  };
}
