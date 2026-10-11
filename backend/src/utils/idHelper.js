const mongoose = require('mongoose');

const isValidObjectId = (id) => {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);
};

const formatDocument = (doc) => {
  if (!doc) return null;

  // Handle Mongoose Document vs Plain Object
  const raw = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };

  // Convert _id to id string
  if (raw._id) {
    raw.id = raw._id.toString();
    delete raw._id;
  }

  // Remove internal fields
  delete raw.__v;
  delete raw.passwordHash;

  // Ensure known ObjectId references are serialized as strings
  const idFields = ['userId', 'vehicleId', 'datasetId', 'pipelineRunId', 'predictionId', 'latestPredictionId'];
  idFields.forEach((field) => {
    if (raw[field] && typeof raw[field].toString === 'function') {
      raw[field] = raw[field].toString();
    }
  });

  return raw;
};

const formatDocuments = (docs) => {
  if (!Array.isArray(docs)) return [];
  return docs.map((doc) => formatDocument(doc));
};

module.exports = {
  isValidObjectId,
  formatDocument,
  formatDocuments,
};
