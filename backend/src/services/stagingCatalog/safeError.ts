// Never log driver errors, connection objects, environment contents, raw rows, or stacks.
export function safeCatalogError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const codes: Record<string, string> = {
    ENOENT: "LOCAL_FILE_NOT_FOUND",
    EACCES: "LOCAL_FILE_ACCESS_DENIED",
    EEXIST: "LOCAL_OUTPUT_ALREADY_EXISTS",
    ENOTFOUND: "DATABASE_DNS_FAILED",
    ETIMEDOUT: "DATABASE_CONNECTION_TIMEOUT",
    ECONNREFUSED: "DATABASE_CONNECTION_REFUSED",
    "28P01": "DATABASE_AUTHENTICATION_FAILED",
    "42501": "DATABASE_PERMISSION_DENIED",
    "40001": "CONCURRENT_CHANGE_TRANSACTION_ABORTED",
    P2034: "CONCURRENT_CHANGE_TRANSACTION_ABORTED",
    P2002: "UNIQUE_CONFLICT_TRANSACTION_ABORTED",
    SELF_SIGNED_CERT_IN_CHAIN: "DATABASE_TLS_CHAIN_FAILED",
    DEPTH_ZERO_SELF_SIGNED_CERT: "DATABASE_TLS_CHAIN_FAILED",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "DATABASE_TLS_CHAIN_FAILED",
    ERR_TLS_CERT_ALTNAME_INVALID: "DATABASE_TLS_HOSTNAME_FAILED",
  };
  if (codes[code]) return codes[code];
  // Only internally authored uppercase identifiers; never forward arbitrary messages.
  const message = error instanceof Error ? error.message : "";
  if (/^Conteo (count|active|inactive) inesperado: esperado \d+, observado \d+\.$/.test(message)) return message;
  if (/^Fila Product \d+ inválida; no se exportaron sus valores\.$/.test(message)) return message;
  if (message === "El checksum del snapshot no coincide.") return "CHECKSUM_MISMATCH";
  const allowed = new Set([
    "READ_ONLY_REQUIRED", "REPORT_DIRECTORY_MUST_BE_LOCAL_IGNORED", "UNSAFE_REPORT_DIRECTORY",
    "INVALID_SNAPSHOT_FILE", "SNAPSHOT_REQUIRES_PRIVATE_PERMISSIONS", "INVALID_CHECKSUM_FILE",
    "STAGING_TARGET_REQUIRED", "EXPLICIT_MODE_REQUIRED", "EXECUTION_CONFIRMATION_REQUIRED",
    "DRY_RUN_REQUIRED", "EXECUTE_REQUIRED", "CATALOG_CONFLICTS_REQUIRE_HUMAN_REVIEW",
    "STRICT_STAGING_WRITER_REQUIRED", "SNAPSHOT_VALIDATION_FAILED", "CHECKSUM_MISMATCH",
    "UNAUTHORIZED_IMAGE_REFERENCE", "PUBLIC_ASSET_CHECK_FAILED", "PUBLIC_ASSET_HTTP_NOT_200", "PUBLIC_ASSET_UNSUPPORTED_CONTENT_TYPE",
  ]);
  return allowed.has(message) ? message : "CATALOG_VALIDATION_OR_OPERATION_FAILED";
}
