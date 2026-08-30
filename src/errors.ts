/** Thrown when a policy set is structurally invalid. Agent Sudo never fails open. */
export class InvalidPolicySetError extends Error {
  override readonly name = "InvalidPolicySetError";

  constructor(message: string) {
    super(message);
  }
}

/** Thrown when a request is missing the minimum required fields. */
export class InvalidRequestError extends Error {
  override readonly name = "InvalidRequestError";

  constructor(message: string) {
    super(message);
  }
}
