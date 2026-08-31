/**
 * The canonical action vocabulary both runtimes translate *into*.
 *
 * This is deliberately separate from `shared-policy.ts`: it is part of the
 * request contract (what an `action.name` may be), not the policy (what should
 * happen for a given action). Each runtime mapper targets this vocabulary; the
 * shared policy is written against it. Neither mapper imports the policy itself.
 */

export const CANONICAL_ACTIONS = {
  readCustomer: "read_customer",
  deleteCustomer: "delete_customer",
  sendEmail: "send_email",
} as const;
