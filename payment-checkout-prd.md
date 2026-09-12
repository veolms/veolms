# Payment and Checkout Frontend PRD

## Objective
Allow an authenticated student to purchase a paid course from the course page using the existing backend checkout and Razorpay APIs.

## User Flow
Student opens paid course → clicks **Buy Now** → sees server-calculated price → creates checkout order → Razorpay payment window opens → payment is verified by backend → student gets course access → student is redirected to learning.

## Backend APIs to use

### 1. Preview checkout

`POST /checkout/preview`

Request:

```json
{
  "items": [{ "itemType": "course", "courseId": "COURSE_ID" }],
  "couponCode": "OPTIONAL_COUPON"
}
```

Use the returned pricing as the final amount shown to the student. Never calculate or trust the price only in frontend.

### 2. Create order

`POST /checkout/orders`

Send the course item, optional coupon, and a unique `idempotencyKey`. The response returns the internal order and Razorpay gateway details such as `gatewayOrderId`, `keyId`, amount, and currency.

### 3. Verify payment

`POST /payments/verify`

After Razorpay success, send:

```json
{
  "orderId": "INTERNAL_ORDER_ID",
  "gatewayOrderId": "RAZORPAY_ORDER_ID",
  "gatewayPaymentId": "RAZORPAY_PAYMENT_ID",
  "gatewaySignature": "RAZORPAY_SIGNATURE"
}
```

Only show payment success and redirect to learning after this API succeeds.

## Frontend Requirements

- Add payment service, query keys, and mutation hooks following the existing frontend pattern.
- Connect the paid course **Buy Now** button to checkout.
- Require login before starting checkout.
- Add checkout UI with price, coupon option, Pay Now button, loading state, cancel state, success state, and error/retry state.
- Load Razorpay Checkout safely and use the backend gateway response.
- Prevent duplicate order creation by using an idempotency key and disabling the button while processing.
- Refresh course, enrollment, and order data after successful payment.
- Keep creator preview and creator course actions unchanged.
- Support free courses by completing the order and redirecting without opening Razorpay when the backend returns no gateway.

## Error Cases

Handle login required, invalid coupon, already-owned course, expired order, payment cancelled, Razorpay failure, invalid signature, amount mismatch, network failure, and verification failure.

## Success Criteria

An authenticated student can buy a paid course in Razorpay test mode, the backend verifies and fulfills the order, course access is granted, the student can open protected lessons, and the purchase is visible after refreshing the page.

## Testing

Test checkout preview, order creation, Razorpay success/cancel/failure, duplicate clicks, retry after failure, free course checkout, unauthenticated access, invalid verification, and post-payment course access.
