const tf = require("@tensorflow/tfjs");
const fs = require("fs");
const path = require("path");

const MODEL_DIR = path.join(__dirname, "models");

const MODEL_PATH = path.join(
  MODEL_DIR,
  "model.json"
);

const WEIGHTS_PATH = path.join(
  MODEL_DIR,
  "weights.bin"
);

const METADATA_PATH = path.join(
  MODEL_DIR,
  "preprocessing.json"
);

const REQUIRED_FEATURES = [
  "avg_speed_kmph",
  "pickup_delay_seconds",
  "driver_to_pickup_km",
  "pickup_to_dropoff_km",
  "traffic_multiplier",
];

let loadedModel = null;
let preprocessing = null;

async function loadEtaModel() {
  if (loadedModel) {
    return loadedModel;
  }

  await tf.setBackend("cpu");
  await tf.ready();

  if (
    !fs.existsSync(MODEL_PATH) ||
    !fs.existsSync(WEIGHTS_PATH) ||
    !fs.existsSync(METADATA_PATH)
  ) {
    throw new Error(
      "Trained model files are missing. Run trainModel.js first."
    );
  }

  const modelJson = JSON.parse(
    fs.readFileSync(MODEL_PATH, "utf8")
  );

  preprocessing = JSON.parse(
    fs.readFileSync(METADATA_PATH, "utf8")
  );

  const weightBuffer = fs.readFileSync(WEIGHTS_PATH);

  // Convert Node.js Buffer into an exact ArrayBuffer.
  const weightData = weightBuffer.buffer.slice(
    weightBuffer.byteOffset,
    weightBuffer.byteOffset + weightBuffer.byteLength
  );

  const weightManifest = modelJson.weightsManifest;

  if (
    !Array.isArray(weightManifest) ||
    weightManifest.length === 0
  ) {
    throw new Error("Invalid model weight manifest.");
  }

  const weightSpecs = weightManifest.flatMap(
    (group) => group.weights
  );

  const modelArtifacts = {
    modelTopology: modelJson.modelTopology,
    format: modelJson.format,
    generatedBy: modelJson.generatedBy,
    convertedBy: modelJson.convertedBy,
    weightSpecs,
    weightData,
  };

  loadedModel = await tf.loadLayersModel({
    load: async () => modelArtifacts,
  });

  if (
    !Array.isArray(preprocessing.features) ||
    preprocessing.features.length !== REQUIRED_FEATURES.length ||
    !REQUIRED_FEATURES.every(
      (feature, index) =>
        preprocessing.features[index] === feature
    )
  ) {
    throw new Error(
      "Model preprocessing feature configuration does not match."
    );
  }

  console.log("ETA model loaded successfully.");
  console.log("TensorFlow.js:", tf.version.tfjs);
  console.log("Backend:", tf.getBackend());

  return loadedModel;
}

function getFeatureValues(candidate) {
  const values = [
    candidate.avgSpeedKmph,
    candidate.pickupDelaySeconds,
    candidate.driverToPickupKm,
    candidate.pickupToDropoffKm,
    candidate.trafficMultiplier,
  ];

  if (!values.every(Number.isFinite)) {
    throw new Error(
      `Invalid prediction inputs for driver ${
        candidate.driverName || candidate.driverId || "unknown"
      }. All five numeric features are required.`
    );
  }

  return values;
}

async function predictETAs(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("Provide at least one driver candidate.");
  }

  const model = await loadEtaModel();

  const normalizedInputs = candidates.map((candidate) => {
    const values = getFeatureValues(candidate);

    return values.map(
      (value, index) =>
        (value - preprocessing.featureMeans[index]) /
        preprocessing.featureStdDevs[index]
    );
  });

  const inputTensor = tf.tensor2d(
    normalizedInputs,
    [candidates.length, REQUIRED_FEATURES.length]
  );

  let outputTensor;

  try {
    outputTensor = model.predict(inputTensor);

    const normalizedPredictions = Array.from(
      await outputTensor.data()
    );

    return candidates.map((candidate, index) => {
      const predictedSeconds =
        normalizedPredictions[index] *
          preprocessing.targetStd +
        preprocessing.targetMean;

      const etaSeconds = Math.max(0, predictedSeconds);

      return {
        driverId: candidate.driverId,
        driverName: candidate.driverName,
        predictedEtaSeconds: Number(
          etaSeconds.toFixed(2)
        ),
        predictedEtaMinutes: Number(
          (etaSeconds / 60).toFixed(2)
        ),
      };
    });
  } finally {
    inputTensor.dispose();

    if (outputTensor) {
      outputTensor.dispose();
    }
  }
}

async function predictETA(candidate) {
  const results = await predictETAs([candidate]);
  return results[0];
}

module.exports = {
  loadEtaModel,
  predictETA,
  predictETAs,
};
