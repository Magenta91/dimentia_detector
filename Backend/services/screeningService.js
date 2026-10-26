
import { ObjectId } from "mongodb";
import { getDatabase } from "../config/db.js";
import {
  calculateTappingMetrics,
  evaluateOrientation,
  validateClinicianObservation,
  validatePatientProfile,
  validateVoiceResponse
} from "./assessmentValidation.js";

const allowedTasks = [
  "memory",
  "attention",
  "language",
  "orientation",
  "voice",
  "motor_tapping",
  "clinician_observation"
];

const requiredTasks = [
  "memory",
  "attention",
  "orientation",
  "language"
];

const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseId = (value, label = "ID") => {
  if (!value) {
    throw new Error(`Invalid ${label}`);
  }
  
  try {
    return new ObjectId(value);
  } catch {
    throw new Error(`Invalid ${label}`);
  }
};

const calculateScore = (taskType, data = {}) => {
  if (taskType === "memory") {
    const shown = Array.isArray(data.wordsShown)
      ? data.wordsShown.map((word) =>
          String(word).trim().toLowerCase()
        )
      : [];

    const recalled = Array.isArray(data.wordsRecalled)
      ? data.wordsRecalled.map((word) =>
          String(word).trim().toLowerCase()
        ).filter(Boolean)
      : [];

    const matches = new Set(
      recalled.filter((word) => shown.includes(word))
    );

    return shown.length
      ? (matches.size / shown.length) * 100
      : 0;
  }

  if (taskType === "attention") {
    const correct = Math.max(0, safeNumber(data.correct));
    const wrong = Math.max(0, safeNumber(data.wrong));
    const missed = Math.max(0, safeNumber(data.missed));
    const total = correct + wrong + missed;

    return total ? (correct / total) * 100 : 0;
  }

  if (taskType === "orientation") {
    return evaluateOrientation(data).score;
  }

  if (taskType === "motor_tapping") {
    calculateTappingMetrics(data);
  }

  if (taskType === "clinician_observation") {
    validateClinicianObservation(data);
  }

  // No validated composite score is defined for these task types.
  return null;
};

export const buildCognitiveTaskScore = (taskResults = {}) => {
  const supportedTasks = ["memory", "attention", "orientation"];
  const measured = supportedTasks
    .map((task) => {
      const score = taskResults[task]?.score;
      return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100
        ? { task, score }
        : null;
    })
    .filter(Boolean);
  const missing = supportedTasks.filter(
    (task) => !measured.some((entry) => entry.task === task)
  );
  return {
    status: measured.length === supportedTasks.length
      ? "complete"
      : measured.length
        ? "partial"
        : "unavailable",
    index_percent: measured.length
      ? Number((measured.reduce((sum, entry) => sum + entry.score, 0) / measured.length).toFixed(2))
      : null,
    included_tasks: measured.map(({ task }) => task),
    not_measured_tasks: missing,
    method: "Unweighted arithmetic mean of the available memory, attention, and orientation task percentages. Language is not included because the current task has no validated numeric scoring rule.",
    limitation: "Task-performance score only; not a validated instrument, diagnosis, clinical risk score, or probability."
  };
};

export const buildDescriptiveTaskSummary = buildCognitiveTaskScore;

const VOICE_COVERAGE_FIELDS = [
  "transcript_word_count",
  "sentence_count",
  "filler_word_count",
  "speech_rate_words_per_minute",
  "audio_duration_seconds",
  "pause_count",
  "mean_pause_seconds",
  "maximum_pause_seconds",
  "lexical_diversity",
  "adjacent_repeated_word_count"
];

export const buildVoiceAnalysisSummary = (voiceResult = {}) => {
  const features = voiceResult?.measurements?.speech_features?.features || {};
  const measuredFields = VOICE_COVERAGE_FIELDS.filter(
    (field) => typeof features[field] === "number" && Number.isFinite(features[field])
  );
  const status = voiceResult?.measurements?.status || voiceResult?.status || "not_assessed";
  const wordCount = features.transcript_word_count;
  const scoreComponents = {};
  if (typeof features.filler_word_ratio_percent === "number" && wordCount > 0) {
    scoreComponents.filler_control = Number(
      Math.max(0, 100 - features.filler_word_ratio_percent).toFixed(2)
    );
  }
  if (
    typeof features.adjacent_repeated_word_count === "number"
    && typeof wordCount === "number"
    && wordCount > 0
  ) {
    scoreComponents.repetition_control = Number(
      Math.max(0, 100 * (1 - Math.min(1, features.adjacent_repeated_word_count / wordCount))).toFixed(2)
    );
  }
  if (
    typeof features.pause_count === "number"
    && typeof wordCount === "number"
    && wordCount > 0
  ) {
    scoreComponents.pause_observation = Number(
      Math.max(0, 100 * (1 - Math.min(1, features.pause_count / wordCount))).toFixed(2)
    );
  }
  if (typeof features.lexical_diversity === "number") {
    scoreComponents.lexical_diversity = Number(
      (Math.max(0, Math.min(1, features.lexical_diversity)) * 100).toFixed(2)
    );
  }
  const availableComponents = Object.values(scoreComponents);
  return {
    status,
    score_percent: availableComponents.length
      ? Number((availableComponents.reduce((sum, value) => sum + value, 0) / availableComponents.length).toFixed(2))
      : null,
    score_components: scoreComponents,
    available_score_components: Object.keys(scoreComponents),
    feature_coverage_percent: VOICE_COVERAGE_FIELDS.length
      ? Number((measuredFields.length / VOICE_COVERAGE_FIELDS.length * 100).toFixed(2))
      : null,
    measured_fields: measuredFields,
    missing_fields: VOICE_COVERAGE_FIELDS.filter((field) => !measuredFields.includes(field)),
    method: "Experimental speech-fluency indicator: equal-weight arithmetic mean of available components only. Filler control = max(0, 100 - filler percentage); repetition control = 100 × (1 - adjacent repeated words / transcript words), capped at 0; pause observation = 100 × (1 - pause count / transcript words), capped at 0; lexical diversity = lexical diversity ratio × 100. Words per minute, duration, and pause durations remain descriptive measurements and are not assigned a better/worse direction.",
    limitation: "Experimental descriptive indicator only. It uses literal transcript and timing features, has no clinical threshold or validated weights, and is not a voice diagnosis, classifier, probability, or dementia score."
  };
};

export const createScreening = async (userId, inputProfile) => {
  const uid = parseId(userId, "user ID");
  const profile = validatePatientProfile(inputProfile);
  const db = getDatabase();

  // Create screening session
  const session = {
    user_id: uid,
    status: "in_progress",
    started_at: new Date(),
    completed_at: null
  };

  const sessionResult = await db.collection("screening_sessions").insertOne(session);
  const screeningId = sessionResult.insertedId;

  // Create patient profile
  const patientProfile = {
    screening_id: screeningId,
    patient_identifier: profile.patientIdentifier,
    age: profile.age,
    sex: profile.sex,
    education_years: profile.educationYears,
    handedness: profile.handedness,
    socioeconomic_status: profile.socioeconomicStatus,
    medical_history: profile.medicalHistory,
    medications: profile.medications,
    reported_symptoms: profile.reportedSymptoms,
    symptom_onset: profile.symptomOnset,
    functional_changes: profile.functionalChanges,
    family_history: profile.familyHistory,
    consent_at: new Date(),
    created_at: new Date(),
    updated_at: new Date()
  };

  await db.collection("screening_patient_profiles").insertOne(patientProfile);

  return {
    id: screeningId.toString(),
    user_id: uid.toString(),
    status: session.status,
    started_at: session.started_at,
    completed_at: session.completed_at
  };
};

export const saveTaskResponse = async (
  screeningId,
  userId,
  taskType,
  responseData,
  reactionTime
) => {
  const sid = parseId(screeningId, "screening ID");
  const uid = parseId(userId, "user ID");
  const db = getDatabase();

  if (!allowedTasks.includes(taskType)) {
    throw new Error("Invalid task type");
  }

  if (
    !responseData ||
    typeof responseData !== "object" ||
    Array.isArray(responseData)
  ) {
    throw new Error("responseData must be an object");
  }

  if (Buffer.byteLength(JSON.stringify(responseData), "utf8") > 50000) {
    throw new Error("Task response is too large");
  }

  let storedResponseData = responseData;
  if (taskType === "voice") {
    storedResponseData = validateVoiceResponse(responseData);
  } else if (taskType === "orientation") {
    storedResponseData = {
      ...responseData,
      orientationMetrics: evaluateOrientation(responseData)
    };
  } else if (taskType === "motor_tapping") {
    storedResponseData = calculateTappingMetrics(responseData);
  } else if (taskType === "clinician_observation") {
    storedResponseData = validateClinicianObservation(responseData);
  }

  const score = calculateScore(taskType, storedResponseData);
  const reaction = reactionTime == null
    ? null
    : Math.max(0, safeNumber(reactionTime));

  // Verify session exists and belongs to user
  const session = await db.collection("screening_sessions").findOne({
    _id: sid,
    user_id: uid,
    status: "in_progress"
  });

  if (!session) {
    throw new Error("Active screening not found for this user");
  }

  // Delete existing response for this task type
  await db.collection("task_responses").deleteMany({
    screening_id: sid,
    task_type: taskType
  });

  // Insert new response
  const taskResponse = {
    screening_id: sid,
    task_type: taskType,
    response_data: storedResponseData,
    score,
    reaction_time: reaction,
    created_at: new Date()
  };

  const result = await db.collection("task_responses").insertOne(taskResponse);

  return {
    id: result.insertedId.toString(),
    screening_id: sid.toString(),
    task_type: taskType,
    response_data: storedResponseData,
    score,
    reaction_time: reaction,
    created_at: taskResponse.created_at
  };
};

export const getScreeningSummary = async (screeningId, userId) => {
  const sid = parseId(screeningId, "screening ID");
  const uid = parseId(userId, "user ID");
  const db = getDatabase();

  const session = await db.collection("screening_sessions").findOne({
    _id: sid,
    user_id: uid
  });

  if (!session) {
    throw new Error("Screening not found");
  }

  // Get all task responses - get the most recent for each task type
  const tasks = await db.collection("task_responses")
    .find({ screening_id: sid })
    .sort({ created_at: -1 })
    .toArray();

  // Keep only the most recent response per task type
  const tasksByType = {};
  tasks.forEach(task => {
    if (!tasksByType[task.task_type]) {
      tasksByType[task.task_type] = task;
    }
  });

  const profile = await db.collection("screening_patient_profiles").findOne({
    screening_id: sid
  });

  const scores = {};
  const taskResults = {};

  Object.values(tasksByType).forEach(task => {
    taskResults[task.task_type] = {
      status: task.response_data?.status || "completed",
      score: task.score == null ? null : Number(task.score),
      measurements: task.response_data,
      timestamp: task.created_at
    };
    if (task.score !== null && task.score !== undefined) {
      scores[task.task_type] = Number(task.score);
    }
  });

  const cognitiveTaskScore = buildCognitiveTaskScore(taskResults);
  const voiceAnalysisSummary = buildVoiceAnalysisSummary(taskResults.voice);

  const completedTasks = new Set(Object.keys(tasksByType));
  const missing = requiredTasks.filter((task) => !completedTasks.has(task));

  if (missing.length) {
    throw new Error(
      `Complete these required tasks first: ${missing.join(", ")}`
    );
  }

  return {
    screeningId: sid.toString(),
    overallScore: cognitiveTaskScore.index_percent,
    recommendation: "Discuss concerns with a qualified healthcare professional.",
    flags: [
      "Research and educational prototype; it cannot diagnose or rule out dementia.",
      "Digital task measurements are not validated clinical instruments."
    ],
    taskScores: scores,
    descriptiveTaskSummary: cognitiveTaskScore,
    cognitiveTaskScore,
    voiceAnalysisSummary,
    taskResults,
    completedTasks: [...completedTasks],
    optionalTasks: {
      voice: taskResults.voice?.measurements?.status || taskResults.voice?.status || "not_assessed",
      motor_tapping: taskResults.motor_tapping?.status || "not_assessed",
      clinician_observation: taskResults.clinician_observation?.status || "not_assessed"
    },
    patientReference: profile ? {
      patient_identifier: profile.patient_identifier,
      age: profile.age,
      sex: profile.sex
    } : null
  };
};

export const upsertAssessmentResult = async (
  screeningId,
  userId,
  payload = {}
) => {
  const sid = parseId(screeningId, "screening ID");
  const uid = parseId(userId, "user ID");
  const db = getDatabase();

  // Verify session exists and belongs to user
  const session = await db.collection("screening_sessions").findOne({
    _id: sid,
    user_id: uid
  });

  if (!session) {
    throw new Error("Screening not found for this user");
  }

  const taskScores = payload.taskScores || {};
  const storedTaskScores = {
    ...taskScores,
    ...(payload.descriptiveTaskSummary
      ? { __descriptiveTaskSummary: payload.descriptiveTaskSummary }
      : {}),
    ...(payload.cognitiveTaskScore
      ? { __cognitiveTaskScore: payload.cognitiveTaskScore }
      : {}),
    ...(payload.voiceAnalysisSummary
      ? { __voiceAnalysisSummary: payload.voiceAnalysisSummary }
      : {}),
    ...(payload.cognitivePrediction
      ? { __cognitivePrediction: payload.cognitivePrediction }
      : {}),
    ...(payload.voicePrediction
      ? { __voicePrediction: payload.voicePrediction }
      : {}),
    __modelOutput: payload.modelOutput || {
      status: "unavailable",
      code: "model_unavailable",
      model_version: null,
      output: null,
      evaluation_status: "not_run",
      missing_inputs: [],
      reason: "Model output was not requested.",
      limitations: [
        "Research/educational output only; not a diagnosis or clinical risk assessment."
      ]
    }
  };

  const nullableNumber = (value) => value == null ? null : safeNumber(value);
  
  const resultData = {
    screening_id: sid,
    memory_score: nullableNumber(taskScores.memory),
    attention_score: nullableNumber(taskScores.attention),
    language_score: nullableNumber(taskScores.language),
    orientation_score: nullableNumber(taskScores.orientation),
    overall_score: nullableNumber(payload.overallScore),
    risk_level: null,
    risk_score: null,
    probability: null,
    task_scores: storedTaskScores,
    recommendation: String(payload.recommendation || "Discuss concerns with a qualified healthcare professional."),
    flags: Array.isArray(payload.flags) ? payload.flags : [],
    created_at: new Date()
  };

  // Upsert result
  const result = await db.collection("screening_results").findOneAndUpdate(
    { screening_id: sid },
    { $set: resultData },
    { upsert: true, returnDocument: "after" }
  );

  // Update session status
  await db.collection("screening_sessions").updateOne(
    { _id: sid, user_id: uid },
    {
      $set: {
        status: "completed",
        completed_at: new Date()
      }
    }
  );

  return {
    ...result,
    id: result._id.toString(),
    screening_id: sid.toString()
  };
};

export const getAssessmentHistory = async (userId) => {
  const uid = parseId(userId, "user ID");
  const db = getDatabase();

  const results = await db.collection("screening_results").aggregate([
    {
      $lookup: {
        from: "screening_sessions",
        localField: "screening_id",
        foreignField: "_id",
        as: "session"
      }
    },
    {
      $unwind: "$session"
    },
    {
      $match: {
        "session.user_id": uid
      }
    },
    {
      $project: {
        id: { $toString: "$_id" },
        screening_id: { $toString: "$screening_id" },
        overall_score: "$overall_score",
        risk_score: "$risk_score",
        risk_level: "$risk_level",
        recommendation: "$recommendation",
        task_scores: "$task_scores",
        flags: "$flags",
        created_at: "$created_at"
      }
    },
    {
      $sort: { created_at: -1 }
    }
  ]).toArray();

  return results;
};

export const updatePatientProfile = async (screeningId, userId, inputProfile) => {
  const sid = parseId(screeningId, "screening ID");
  const uid = parseId(userId, "user ID");
  const profile = validatePatientProfile(inputProfile);
  const db = getDatabase();

  // Verify session exists, belongs to user, and is in progress
  const session = await db.collection("screening_sessions").findOne({
    _id: sid,
    user_id: uid,
    status: "in_progress"
  });

  if (!session) {
    throw new Error("Active screening not found for this user");
  }

  const result = await db.collection("screening_patient_profiles").updateOne(
    { screening_id: sid },
    {
      $set: {
        patient_identifier: profile.patientIdentifier,
        age: profile.age,
        sex: profile.sex,
        education_years: profile.educationYears,
        handedness: profile.handedness,
        socioeconomic_status: profile.socioeconomicStatus,
        medical_history: profile.medicalHistory,
        medications: profile.medications,
        reported_symptoms: profile.reportedSymptoms,
        symptom_onset: profile.symptomOnset,
        functional_changes: profile.functionalChanges,
        family_history: profile.familyHistory,
        consent_at: new Date(),
        updated_at: new Date()
      }
    }
  );

  if (result.modifiedCount === 0 && result.matchedCount === 0) {
    throw new Error("Active screening not found for this user");
  }

  return { screeningId: sid.toString(), ...profile };
};

export const getScreeningDetails = async (screeningId, userId) => {
  const sid = parseId(screeningId, "screening ID");
  const uid = parseId(userId, "user ID");
  const db = getDatabase();

  const session = await db.collection("screening_sessions").findOne({
    _id: sid,
    user_id: uid
  });

  if (!session) {
    throw new Error("Screening not found");
  }

  const profile = await db.collection("screening_patient_profiles").findOne({
    screening_id: sid
  });

  // Get all task responses - keep most recent per type
  const allTasks = await db.collection("task_responses")
    .find({ screening_id: sid })
    .sort({ created_at: -1 })
    .toArray();

  const tasksByType = {};
  allTasks.forEach(task => {
    if (!tasksByType[task.task_type]) {
      tasksByType[task.task_type] = task;
    }
  });

  return {
    session: {
      id: session._id.toString(),
      status: session.status,
      started_at: session.started_at,
      completed_at: session.completed_at
    },
    patientProfile: profile ? {
      patient_identifier: profile.patient_identifier,
      age: profile.age,
      sex: profile.sex,
      education_years: profile.education_years,
      handedness: profile.handedness,
      socioeconomic_status: profile.socioeconomic_status,
      medical_history: profile.medical_history,
      medications: profile.medications,
      reported_symptoms: profile.reported_symptoms,
      symptom_onset: profile.symptom_onset,
      functional_changes: profile.functional_changes,
      family_history: profile.family_history,
      consent_at: profile.consent_at,
      updated_at: profile.updated_at
    } : null,
    tasks: Object.values(tasksByType).map(task => ({
      task_type: task.task_type,
      response_data: task.response_data,
      score: task.score,
      reaction_time: task.reaction_time,
      created_at: task.created_at
    }))
  };
};

export const getActiveScreening = async (userId) => {
  const uid = parseId(userId, "user ID");
  const db = getDatabase();

  const session = await db.collection("screening_sessions").findOne({
    user_id: uid,
    status: "in_progress"
  }, {
    sort: { started_at: -1 }
  });

  if (!session) {
    return null;
  }

  return getScreeningDetails(session._id.toString(), userId);
};

export const deleteScreening = async (screeningId, userId) => {
  const sid = parseId(screeningId, "screening ID");
  const uid = parseId(userId, "user ID");
  const db = getDatabase();

  const result = await db.collection("screening_sessions").deleteOne({
    _id: sid,
    user_id: uid
  });

  if (result.deletedCount === 0) {
    throw new Error("Screening not found for this user");
  }

  // MongoDB will cascade delete via application logic
  await db.collection("task_responses").deleteMany({ screening_id: sid });
  await db.collection("screening_patient_profiles").deleteMany({ screening_id: sid });
  await db.collection("screening_results").deleteMany({ screening_id: sid });

  return { screeningId: sid.toString(), deleted: true };
};
