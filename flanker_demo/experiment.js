/* ***************************************************************************
 * flanker_demo — a minimal jsPsych 7 flanker task for expfactory-deploy
 *
 * Participants see five arrows (e.g. >><>>) and respond to the direction of
 * the CENTER arrow. Response-key mapping is counterbalanced across
 * participants using the battery's group_index (window.efVars.group_index).
 *
 * THE EXPFACTORY-DEPLOY CONTRACT (how this file is run):
 *   1. expfactory-deploy reads config.json and injects every file in the
 *      "run" list as <script>/<link> tags. Entries starting with "static/"
 *      are shared assets served by the deploy server (jsPsych 7 core,
 *      plugins, CSS); relative entries ("style.css", "experiment.js") come
 *      from this folder in the repo.
 *   2. The deploy page injects battery variables as `window.efVars`
 *      (e.g. { group_index: 3 }) and then does, in effect:
 *          jsPsych = initJsPsych({ on_finish: onFinish });
 *          if (window["flanker_demo_init"]) flanker_demo_init();
 *          jsPsych.run(flanker_demo_experiment);
 *      When the timeline finishes, jsPsych.data is POSTed to the server.
 *
 *   Therefore this file MUST define two globals named after the exp_id:
 *     - var flanker_demo_experiment  (array; the timeline)
 *     - function flanker_demo_init() (pushes trials onto the array)
 *
 *   IMPORTANT: the `jsPsych` instance does NOT exist while this file is
 *   parsed (initJsPsych runs in the page body, after scripts load). So only
 *   reference `jsPsych` inside functions evaluated at trial runtime
 *   (e.g. `stimulus: getStim`, `data: function () {...}`, on_finish), never
 *   at the top level. Plugin constructors (jsPsychHtmlKeyboardResponse, ...)
 *   ARE available at parse time.
 * ************************************************************************* */

/* ************************************ */
/* Counterbalancing via group_index     */
/* ************************************ */
// expfactory-deploy injects window.efVars = { group_index: N } when the
// experiment is served as part of a battery. Fall back to 0 for standalone
// runs/previews.
var group_index =
  window.efVars && typeof window.efVars.group_index !== "undefined"
    ? window.efVars.group_index
    : 0;

// Counterbalance the response-key mapping by group_index parity:
//   even group_index: left arrow -> "z", right arrow -> "m"
//   odd group_index:  left arrow -> "m", right arrow -> "z"
var keyMap =
  group_index % 2 === 0
    ? { left: "z", right: "m" }
    : { left: "m", right: "z" };
var choices = [keyMap.left, keyMap.right];

/* ************************************ */
/* Experimental parameters              */
/* ************************************ */
var expID = "flanker_demo";

const fixationDuration = 500; // ms of "+" before each stimulus
const responseWindow = 1500; // max time to respond
const feedbackDuration = 600; // practice feedback duration
const itiDuration = 250; // blank screen between trials

const numPracticeTrials = 8; // 2 of each stimulus type
const numTestBlocks = 2;
const numTestTrialsPerBlock = 16; // 4 of each stimulus type per block

var expStage = "practice";
var currentBlock = 0;
var stims = []; // shuffled queue; one stim is popped per response trial
var currStim = null;

/* ************************************ */
/* Stimuli                              */
/* ************************************ */
// Respond to the CENTER arrow; the flankers are congruent (>>>>>) or
// incongruent (>><>>). correct_response depends on the group_index key map.
var stimulusTypes = [
  {
    stimulus: "<p class='flanker-stim'>&lt;&lt;&lt;&lt;&lt;</p>", // <<<<<
    data: {
      flanker_direction: "left",
      condition: "congruent",
      correct_response: keyMap.left,
    },
  },
  {
    stimulus: "<p class='flanker-stim'>&lt;&lt;&gt;&lt;&lt;</p>", // <<><<
    data: {
      flanker_direction: "left",
      condition: "incongruent",
      correct_response: keyMap.left,
    },
  },
  {
    stimulus: "<p class='flanker-stim'>&gt;&gt;&gt;&gt;&gt;</p>", // >>>>>
    data: {
      flanker_direction: "right",
      condition: "congruent",
      correct_response: keyMap.right,
    },
  },
  {
    stimulus: "<p class='flanker-stim'>&gt;&gt;&lt;&gt;&gt;</p>", // >><>>
    data: {
      flanker_direction: "right",
      condition: "incongruent",
      correct_response: keyMap.right,
    },
  },
];

/* ************************************ */
/* Instruction / feedback text          */
/* ************************************ */
var welcomeText =
  "<div class='centerbox'>" +
  "<p class='center-block-text'>Welcome! This task takes about 3 minutes.</p>" +
  "<p class='center-block-text'>Press <i>enter</i> to begin.</p>" +
  "</div>";

var instructionPages = [
  "<div class='centerbox'>" +
    "<p class='center-block-text'>On each trial you will see five arrows, e.g.</p>" +
    "<p class='flanker-stim'>&gt;&gt;&lt;&gt;&gt;</p>" +
    "<p class='center-block-text'>Indicate the direction of the <b>center</b> arrow only, ignoring the flankers.</p>" +
    "</div>",
  "<div class='centerbox'>" +
    "<p class='center-block-text'>Press <b>" +
    keyMap.left +
    "</b> if the center arrow points <b>left</b> (&lt;).</p>" +
    "<p class='center-block-text'>Press <b>" +
    keyMap.right +
    "</b> if the center arrow points <b>right</b> (&gt;).</p>" +
    "<p class='center-block-text'>Respond as quickly and accurately as you can. We will start with a short practice round.</p>" +
    "</div>",
];

var testIntroText =
  "<div class='centerbox'>" +
  "<p class='center-block-text'>Practice complete! The real task is the same, but without trial-by-trial feedback.</p>" +
  "<p class='center-block-text'>Reminder: <b>" +
  keyMap.left +
  "</b> = left, <b>" +
  keyMap.right +
  "</b> = right.</p>" +
  "<p class='center-block-text'>Press <i>enter</i> to begin.</p>" +
  "</div>";

var endText =
  "<div class='centerbox'>" +
  "<p class='center-block-text'>Thanks for completing this task!</p>" +
  "<p class='center-block-text'>Press <i>enter</i> to finish.</p>" +
  "</div>";

/* ************************************ */
/* Helper functions (evaluated at trial */
/* runtime, when jsPsych exists)        */
/* ************************************ */

// Pop the next stimulus off the shuffled queue.
var getStim = function () {
  currStim = stims.pop();
  return currStim.stimulus;
};

// Score each response trial as it finishes.
function scoreTrial(data) {
  data.exp_id = expID;
  data.exp_stage = expStage;
  data.block_num = currentBlock;
  data.group_index = group_index;
  data.correct_trial =
    data.response !== null && data.response === data.correct_response ? 1 : 0;
}

// Accuracy/RT summary for the block that just finished.
function getBlockFeedbackText(blockNum) {
  var trials = jsPsych.data
    .get()
    .filter({ trial_id: "test_trial", block_num: blockNum })
    .values();
  var scored = trials.filter(function (t) {
    return t.response !== null;
  });
  var accuracy =
    scored.length > 0
      ? scored.reduce(function (sum, t) {
          return sum + t.correct_trial;
        }, 0) / scored.length
      : 0;
  var correctRts = scored
    .filter(function (t) {
      return t.correct_trial === 1;
    })
    .map(function (t) {
      return t.rt;
    });
  var meanRt =
    correctRts.length > 0
      ? Math.round(
          correctRts.reduce(function (a, b) {
            return a + b;
          }, 0) / correctRts.length
        )
      : 0;
  var missed = trials.length - scored.length;
  var missedText =
    missed > 0
      ? "<p class='block-text'>You missed " +
        missed +
        " trial(s). Try to respond as quickly and accurately as possible.</p>"
      : "";
  return (
    "<div class='centerbox'>" +
    "<p class='block-text'>Block " +
    blockNum +
    " of " +
    numTestBlocks +
    " complete.</p>" +
    "<p class='block-text'>Accuracy: " +
    Math.round(accuracy * 100) +
    "% &nbsp;&nbsp;|&nbsp;&nbsp; Mean RT (correct): " +
    meanRt +
    " ms</p>" +
    missedText +
    "<p class='block-text'>Press <i>enter</i> to continue.</p>" +
    "</div>"
  );
}

/* ************************************ */
/* Trial definitions                    */
/* ************************************ */

var fullscreen = {
  type: jsPsychFullscreen,
  fullscreen_mode: true,
};

var exitFullscreen = {
  type: jsPsychFullscreen,
  fullscreen_mode: false,
};

var welcome = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: welcomeText,
  choices: ["Enter"],
  data: { trial_id: "welcome" },
};

var instructions = {
  type: jsPsychInstructions,
  pages: instructionPages,
  show_clickable_nav: true,
  data: { trial_id: "instructions" },
};

var fixation = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: "<p class='fixation'>+</p>",
  choices: "NO_KEYS",
  trial_duration: fixationDuration,
  data: { trial_id: "fixation" },
};

var iti = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: "",
  choices: "NO_KEYS",
  trial_duration: itiDuration,
  data: { trial_id: "iti" },
};

/* --- Practice trials (with feedback) --- */

var practiceTrial = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: getStim,
  choices: choices,
  stimulus_duration: responseWindow,
  trial_duration: responseWindow,
  response_ends_trial: true,
  data: function () {
    // `stimulus: getStim` is evaluated before `data`, so currStim is fresh.
    return Object.assign({}, currStim.data, { trial_id: "practice_trial" });
  },
  on_finish: scoreTrial,
};

var practiceFeedback = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: function () {
    var last = jsPsych.data.get().last(1).values()[0];
    var text =
      last.response === null
        ? "Too slow!"
        : last.correct_trial === 1
        ? "Correct!"
        : "Incorrect.";
    return "<p class='block-text'>" + text + "</p>";
  },
  choices: "NO_KEYS",
  trial_duration: feedbackDuration,
  data: { trial_id: "practice_feedback" },
};

// Repeat a trial sequence n times as a flat timeline (the same trial objects
// can appear multiple times). We build a flat array rather than using the
// `repetitions` parameter because `on_timeline_start` fires on EVERY
// repetition, which would refill the stimulus queue after every trial.
function repeatSequence(sequence, n) {
  var out = [];
  for (var i = 0; i < n; i++) out.push.apply(out, sequence);
  return out;
}

// on_timeline_start fills the stimulus queue (runs once per node).
var practiceNode = {
  timeline: repeatSequence(
    [fixation, practiceTrial, practiceFeedback, iti],
    numPracticeTrials
  ),
  on_timeline_start: function () {
    stims = jsPsych.randomization.repeat(
      stimulusTypes,
      numPracticeTrials / stimulusTypes.length
    );
  },
};

/* --- Test trials (no feedback) --- */

var testTrial = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: getStim,
  choices: choices,
  stimulus_duration: responseWindow,
  trial_duration: responseWindow,
  response_ends_trial: true,
  data: function () {
    return Object.assign({}, currStim.data, { trial_id: "test_trial" });
  },
  on_finish: scoreTrial,
};

var testIntro = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: testIntroText,
  choices: ["Enter"],
  data: { trial_id: "test_intro" },
};

// Between-block feedback; text is computed when the trial starts.
var blockFeedback = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: function () {
    return getBlockFeedbackText(currentBlock);
  },
  choices: ["Enter"],
  data: { trial_id: "block_feedback" },
};

var endBlock = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: endText,
  choices: ["Enter"],
  data: { trial_id: "end" },
};

// Ask the deploy server to sync data collected so far (window.dataSync is
// provided by the deploy page; guarded so standalone runs don't error).
var dataSync = {
  type: jsPsychCallFunction,
  func: function () {
    if (typeof window.dataSync === "function") window.dataSync();
  },
};

/* ************************************ */
/* Experiment assembly                  */
/* ************************************ */
// expfactory-deploy calls flanker_demo_init() (if it exists) and then runs
// jsPsych.run(flanker_demo_experiment). Both names must match the exp_id.
var flanker_demo_experiment = [];

var flanker_demo_init = function () {
  flanker_demo_experiment.push(fullscreen);
  flanker_demo_experiment.push(welcome);
  flanker_demo_experiment.push(instructions);
  flanker_demo_experiment.push(practiceNode);

  flanker_demo_experiment.push({
    type: jsPsychCallFunction,
    func: function () {
      expStage = "test";
    },
  });
  flanker_demo_experiment.push(testIntro);

  // Wrap each iteration in an IIFE so `blockNum` is captured by value.
  for (var blockNum = 1; blockNum <= numTestBlocks; blockNum++) {
    (function (b) {
      flanker_demo_experiment.push({
        type: jsPsychCallFunction,
        func: function () {
          currentBlock = b;
        },
      });
      flanker_demo_experiment.push({
        timeline: repeatSequence(
          [fixation, testTrial, iti],
          numTestTrialsPerBlock
        ),
        on_timeline_start: function () {
          stims = jsPsych.randomization.repeat(
            stimulusTypes,
            numTestTrialsPerBlock / stimulusTypes.length
          );
        },
      });
      flanker_demo_experiment.push(blockFeedback);
    })(blockNum);
  }

  flanker_demo_experiment.push(dataSync);
  flanker_demo_experiment.push(endBlock);
  flanker_demo_experiment.push(exitFullscreen);
};
