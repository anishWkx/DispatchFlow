const tf = require("@tensorflow/tfjs");
const fs = require("fs");
const path = require("path");

const DATASET_PATH = path.join(
  __dirname,
  "data",
  "synthetic-driver-eta.csv"
);

const MODEL_DIR = path.join(__dirname, "models");
const METADATA_PATH = path.join(
  MODEL_DIR,
  "preprocessing.json"
);

const FEATURES = [
  "avg_speed_kmph",
  "pickup_delay_seconds",
  "driver_to_pickup_km",
  "pickup_to_dropoff_km",
  "traffic_multiplier",
];

const TARGET = "target_eta_seconds";

const TRAIN_RATIO = 0.8;
const EPOCHS = 100;
const BATCH_SIZE = 32;

function loadDataset() {
  const content = fs.readFileSync(DATASET_PATH, "utf8").trim();

  const [headerLine, ...lines] = content.split(/\r?\n/);
  const headers = headerLine.split(",");

  const indexes = Object.fromEntries(
    headers.map((header, index) => [header, index])
  );

  const required = [
    "scenario_id",
    ...FEATURES,
    TARGET,
  ];

  for (const column of required) {
    if (indexes[column] === undefined) {
      throw new Error(`Missing CSV column: ${column}`);
    }
  }

  return lines.map((line) => {
    const values = line.split(",");

    const row = {
      scenarioId: Number(values[indexes.scenario_id]),
      features: FEATURES.map((feature) =>
        Number(values[indexes[feature]])
      ),
      target: Number(values[indexes[TARGET]]),
    };

    if (
      !Number.isFinite(row.scenarioId) ||
      !row.features.every(Number.isFinite) ||
      !Number.isFinite(row.target)
    ) {
      throw new Error("Dataset contains invalid numeric values.");
    }

    return row;
  });
}

function splitByScenario(rows) {
  const scenarioIds = [
    ...new Set(rows.map((row) => row.scenarioId)),
  ].sort((a, b) => a - b);

  const splitIndex = Math.floor(
    scenarioIds.length * TRAIN_RATIO
  );

  const trainIds = new Set(
    scenarioIds.slice(0, splitIndex)
  );

  const trainRows = rows.filter((row) =>
    trainIds.has(row.scenarioId)
  );

  const testRows = rows.filter((row) =>
    !trainIds.has(row.scenarioId)
  );

  return { trainRows, testRows };
}

function calculateNormalization(trainRows) {
  const featureMeans = [];
  const featureStdDevs = [];

  for (let i = 0; i < FEATURES.length; i++) {
    const values = trainRows.map(
      (row) => row.features[i]
    );

    const mean =
      values.reduce((sum, value) => sum + value, 0) /
      values.length;

    const variance =
      values.reduce(
        (sum, value) => sum + (value - mean) ** 2,
        0
      ) / values.length;

    featureMeans.push(mean);
    featureStdDevs.push(Math.sqrt(variance) || 1);
  }

  const targetMean =
    trainRows.reduce((sum, row) => sum + row.target, 0) /
    trainRows.length;

  const targetVariance =
    trainRows.reduce(
      (sum, row) => sum + (row.target - targetMean) ** 2,
      0
    ) / trainRows.length;

  const targetStd = Math.sqrt(targetVariance) || 1;

  return {
    features: FEATURES,
    target: TARGET,
    featureMeans,
    featureStdDevs,
    targetMean,
    targetStd,
  };
}

function normalizeFeatures(rows, metadata) {
  return rows.map((row) =>
    row.features.map(
      (value, index) =>
        (value - metadata.featureMeans[index]) /
        metadata.featureStdDevs[index]
    )
  );
}

function normalizeTargets(rows, metadata) {
  return rows.map(
    (row) =>
      (row.target - metadata.targetMean) /
      metadata.targetStd
  );
}

function createModel() {
  const model = tf.sequential();

  model.add(
    tf.layers.dense({
      inputShape: [FEATURES.length],
      units: 32,
      activation: "relu",
    })
  );

  model.add(
    tf.layers.dense({
      units: 16,
      activation: "relu",
    })
  );

  model.add(
    tf.layers.dense({
      units: 1,
      activation: "linear",
    })
  );

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: "meanSquaredError",
    metrics: ["mae"],
  });

  return model;
}

function calculateMetrics(actual, predicted) {
  const errors = actual.map(
    (value, index) => value - predicted[index]
  );

  const mae =
    errors.reduce(
      (sum, error) => sum + Math.abs(error),
      0
    ) / errors.length;

  const rmse = Math.sqrt(
    errors.reduce(
      (sum, error) => sum + error ** 2,
      0
    ) / errors.length
  );

  return { mae, rmse };
}

async function saveModel(model) {
  fs.mkdirSync(MODEL_DIR, { recursive: true });

  return model.save(
    tf.io.withSaveHandler(async (artifacts) => {
      const modelTopology = artifacts.modelTopology;

      const modelJson = {
        format: artifacts.format,
        generatedBy: artifacts.generatedBy,
        convertedBy: artifacts.convertedBy,
        modelTopology,
        weightsManifest: [
          {
            paths: ["weights.bin"],
            weights: artifacts.weightSpecs,
          },
        ],
      };

      fs.writeFileSync(
        path.join(MODEL_DIR, "model.json"),
        JSON.stringify(modelJson, null, 2)
      );

      fs.writeFileSync(
        path.join(MODEL_DIR, "weights.bin"),
        Buffer.from(artifacts.weightData)
      );

      return {
        modelArtifactsInfo: {
          dateSaved: new Date(),
          modelTopologyType: "JSON",
          modelTopologyBytes: Buffer.byteLength(
            JSON.stringify(modelTopology)
          ),
          weightSpecsBytes: Buffer.byteLength(
            JSON.stringify(artifacts.weightSpecs)
          ),
          weightDataBytes: artifacts.weightData.byteLength,
        },
      };
    })
  );
}

async function main() {
  await tf.setBackend("cpu");
  await tf.ready();

  console.log("TensorFlow.js:", tf.version.tfjs);
  console.log("Backend:", tf.getBackend());

  const rows = loadDataset();

  if (rows.length === 0) {
    throw new Error("Dataset is empty.");
  }

  const { trainRows, testRows } = splitByScenario(rows);

  if (trainRows.length === 0 || testRows.length === 0) {
    throw new Error("Insufficient data for training and testing.");
  }

  const metadata = calculateNormalization(trainRows);

  const trainX = tf.tensor2d(
    normalizeFeatures(trainRows, metadata)
  );

  const trainY = tf.tensor2d(
    normalizeTargets(trainRows, metadata),
    [trainRows.length, 1]
  );

  const testX = tf.tensor2d(
    normalizeFeatures(testRows, metadata)
  );

  const model = createModel();

  let predictions;

  try {
    console.log("\nTraining model...");
    console.log("Total samples:", rows.length);
    console.log("Training samples:", trainRows.length);
    console.log("Testing samples:", testRows.length);

    await model.fit(trainX, trainY, {
      epochs: EPOCHS,
      batchSize: BATCH_SIZE,
      shuffle: true,
      validationSplit: 0.1,
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          if ((epoch + 1) % 10 === 0) {
            console.log(
              `Epoch ${epoch + 1}/${EPOCHS} - ` +
              `loss: ${logs.loss.toFixed(6)} - ` +
              `val_loss: ${logs.val_loss.toFixed(6)}`
            );
          }
        },
      },
    });

    predictions = model.predict(testX);

    const normalizedPredictions = Array.from(
      await predictions.data()
    );

    const predictedSeconds = normalizedPredictions.map(
      (value) =>
        value * metadata.targetStd + metadata.targetMean
    );

    const actualSeconds = testRows.map(
      (row) => row.target
    );

    const metrics = calculateMetrics(
      actualSeconds,
      predictedSeconds
    );

    const baselinePredictions = testRows.map(
      () => metadata.targetMean
    );

    const baselineMetrics = calculateMetrics(
      actualSeconds,
      baselinePredictions
    );

    const modelResults = {
      ...metadata,
      datasetType: "synthetic",
      trainingSamples: trainRows.length,
      testingSamples: testRows.length,
      totalSamples: rows.length,
      scenarioSplit: "80/20 by scenario_id",
      epochs: EPOCHS,
      batchSize: BATCH_SIZE,
      metrics,
      baselineMetrics,
      trainedAt: new Date().toISOString(),
    };

    console.log("\nModel evaluation");
    console.log("--------------------------------");
    console.log(
      "Model MAE:",
      metrics.mae.toFixed(2),
      "seconds"
    );
    console.log(
      "Model RMSE:",
      metrics.rmse.toFixed(2),
      "seconds"
    );
    console.log(
      "Baseline MAE:",
      baselineMetrics.mae.toFixed(2),
      "seconds"
    );
    console.log(
      "Baseline RMSE:",
      baselineMetrics.rmse.toFixed(2),
      "seconds"
    );

    await saveModel(model);

    fs.writeFileSync(
      METADATA_PATH,
      JSON.stringify(modelResults, null, 2)
    );

    console.log("\nModel saved successfully.");
    console.log("Model:", path.join(MODEL_DIR, "model.json"));
    console.log("Weights:", path.join(MODEL_DIR, "weights.bin"));
    console.log("Metadata:", METADATA_PATH);
  } finally {
    if (predictions) {
      predictions.dispose();
    }

    trainX.dispose();
    trainY.dispose();
    testX.dispose();
    model.dispose();
  }
}

main().catch((error) => {
  console.error("\nTraining failed:", error);
  process.exitCode = 1;
});
