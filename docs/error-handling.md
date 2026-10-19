# Runtime error handling

Express central errors use {success:false,data:null,message,error:{code,details}}. Ordinary successes use {success:true,data,message,error:null}. Existing auth/charging rate limit middleware returns 429 {success:false,error:{code:"RATE_LIMITED",message}}; this exception is documented rather than changing the public shape. Frontend api.js handles both message placements.

| HTTP status | Typical application codes/meaning |
|---|---|
| 400 | VALIDATION_ERROR, INVALID_OBJECT_ID, INVALID_FILE (including Multer limits) |
| 401 | UNAUTHORIZED; missing/invalid JWT |
| 403 | FORBIDDEN; resource belongs to another user |
| 404 | RESOURCE_NOT_FOUND; absent or uncommitted result |
| 409 | CONFLICT, DUPLICATE_RESOURCE; active processing/deletion or duplicate resource |
| 422 | MAPPING_CONFIRMATION_REQUIRED; unknown telemetry columns |
| 429 | RATE_LIMITED |
| 500 | INTERNAL_SERVER_ERROR; production hides internal details |

POST process returns 202 once queued. Worker failures are persisted, not retroactively returned as a different POST status. GET status returns 200 with dataset/run failed and errors. Refresh reads this failure. Active stages fail; downstream stages remain uncompleted. Compensation removes partial results; history exposes completed runs only. One worker/startup reconciliation are required.

FastAPI uses {detail:{code,message}}: INVALID_ML_INPUT/422, MODEL_UNAVAILABLE/503, INVALID_MODEL_OUTPUT/503. Pydantic request validation can return detail arrays. It is a separate internal contract.

| Actual ML condition | Node reason recorded/displayed |
|---|---|
| Refused/unreachable service | unreachable |
| Header or body timeout | timeout |
| HTML/plaintext/missing JSON type | invalid_response_content_type |
| JSON decoding failure | invalid_json |
| Unexpected success status/body | invalid_response |
| Malformed error/code-status pair | invalid_error_response |
| Valid unapproved-model response | service_error_503:MODEL_UNAVAILABLE |
| Invalid model output | service_error_503:INVALID_MODEL_OUTPUT |
| Invalid history | service_error_422:INVALID_ML_INPUT |
| FastAPI request-body validation | service_error_422:REQUEST_VALIDATION_ERROR |
| Standard FastAPI 404 | service_error_404 |
| Invalid configured URL | invalid_configuration |
| Empty configured URL | not_configured |
| Node input rejection | invalid_input |

The UI preserves "ML inference unavailable: <reason>". Communication failures never become MODEL_UNAVAILABLE. GET FastAPI /health HTTP200 with models_loaded=false means reachable but not ready. It is normal while V3 is unapproved. Explanations cannot replace inference. See [communication diagnosis](ml-communication-fix.md) and [service contract](ml-backend-contract.md).
