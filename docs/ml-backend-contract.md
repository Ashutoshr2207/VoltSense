# Express ↔ FastAPI inference contract

Implemented HTTP/JSON boundary, independent of the public /api envelope. Express owns parsing/aggregation and database writes; FastAPI never reads an upload URL or writes MongoDB. Default ML_SERVICE_URL=http://127.0.0.1:8000; configurable timeout ML_SERVICE_TIMEOUT_MS defaults to 20000. Node does not start Python.

## Request

POST /predict, Content-Type: application/json:

~~~json
{"cycleTable":[{"cycle":1,"capacity":2.0},{"cycle":2,"capacity":1.99},{"cycle":3,"capacity":1.98},{"cycle":4,"capacity":1.97},{"cycle":5,"capacity":1.96},{"cycle":6,"capacity":1.95},{"cycle":7,"capacity":1.94}],"eolThreshold":80,"batteryId":"synthetic-example"}
~~~

Capacity is completed-discharge Ah, cycle is consecutive discharge ordinal starting at 1, at least seven rows. Full history and first reference are mandatory. batteryId is string or null; mixed row identities are rejected. Optional aggregate signal fields may accompany rows, but are not estimator features. Missing/nonfinite/nonpositive capacities, gaps, duplicates, reordering and thresholds other than 80 fail validation. Node sends histories; Python derives the ordered 13-feature row in features.py strictly before target t, then the fitted model preprocessing.

## Responses

GET /health returns 200 JSON {status:"ok",models_loaded:true} or {status:"error",models_loaded:false}. HTTP reachability and model readiness are separate.

POST success is 200 flat JSON (shape, not a live model result):

~~~text
{soh, rul, capacity, referenceCapacity, currentCycle, eolThreshold:80,
 status, factors:[{name,condition,impact,explanation}], recommendations:[],
 model:{name,version,algorithm}, metrics:{mae,rmse,r2},
 confidence:{calibrated:false,method:null,value:null,uncertaintyInterval:"Unavailable"}}
~~~

soh is capped percentage, capacity/referenceCapacity Ah, rul nonnegative integer discharge cycles, currentCycle=t. status=healthy if rounded SOH>=90, attention if>=80, else critical. Metrics are null unless supplied as measured battery-disjoint final-test SOH metrics in the manifest. Confidence is not fabricated.

Errors are JSON {detail:{code,message}}: 422 INVALID_ML_INPUT; 503 MODEL_UNAVAILABLE (no approved compatible artifact); 503 INVALID_MODEL_OUTPUT. FastAPI body validation may use detail:[...] with 422. See [transport/error distinctions](error-handling.md); Node validates content type, JSON, status/code pair and output schema rather than trusting HTTP success.

Approval precedes the observed-EOL guard. If any supplied observed capacity reached <=80% of Q1, approved serving returns rul=0 even after recovery, without calling the RUL estimator. A censored training history has no label; an approved model may forecast on a valid not-yet-crossed observed history, but this does not create ground truth. V3 remains unapproved, so every valid request currently fails truthfully with MODEL_UNAVAILABLE.

Node maps response.soh to prediction.soh/modelSoh and response.rul to prediction.rulCycles. estimatedEOLCycle is the first observed crossing when known, otherwise currentCycle+rul. It can precede currentCycle. Measured values remain separate. Only successful committed runs publish predictions, history, insights and completion notifications. No dataLocation, object-store path, Python ingestion callback or competing database contract exists.
