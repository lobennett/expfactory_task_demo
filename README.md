# expfactory-task-demo

A minimal "hello world" cognitive task for the [Experiment Factory](https://expfactory.github.io/)
deployment platform ([expfactory-deploy](https://github.com/expfactory/expfactory-deploy)),
hosted at <https://deploy.expfactory.org/>.

It contains a single experiment, **`flanker_demo`**: a minimal Eriksen
flanker task built with [jsPsych 7](https://www.jspsych.org/), following the
conventions of the [Poldrack Lab RDoC battery](https://github.com/lobennett/expfactory-experiments-rdoc).

Participants see five arrows (e.g. `>><>>`) and press a key indicating the
direction of the **center** arrow. The response-key mapping (`z`/`m`) is
counterbalanced across participants using the battery's `group_index`
(`window.efVars.group_index`). The task runs a short practice block with
feedback, then two test blocks, and takes about 3 minutes.

## Repository structure

expfactory-deploy crawls a repository for folders containing a valid
`config.json`; each such folder is one experiment:

```
expfactory-task-demo/
├── create_experiment.py   # scaffold a new experiment (run with `uv run`)
└── flanker_demo/          # folder name == exp_id
    ├── config.json        # experiment metadata + list of files to load
    ├── experiment.js      # the jsPsych 7 timeline
    └── style.css          # experiment-specific styles
```

## The expfactory-deploy contract

1. **`config.json`** declares the experiment. The important fields:
   - `"exp_id": "flanker_demo"` — must match the folder name.
   - `"template": "jspsych"`.
   - `"run"` — the ordered list of files injected into the page as
     `<script>`/`<link>` tags. Entries starting with `static/` are shared
     assets served by the deploy server (jsPsych 7 core, plugins, CSS);
     relative entries (`style.css`, `experiment.js`) are served from this
     folder in the repo.
2. **Battery variables.** The deploy page injects `window.efVars` (e.g.
   `{ group_index: 3 }`) before loading the experiment scripts; read it at
   parse time (this demo uses it to counterbalance response keys).
3. **jsPsych 7 boot sequence.** The deploy page does, in effect:

   ```js
   jsPsych = initJsPsych({ on_finish: onFinish }); // onFinish POSTs your data
   if (window["flanker_demo_init"]) flanker_demo_init();
   jsPsych.run(flanker_demo_experiment);
   ```

   So `experiment.js` must define two globals named after the exp_id:
   - `var <exp_id>_experiment` — an array (the timeline)
   - `function <exp_id>_init()` — pushes trials onto the array

   Because `jsPsych` (the instance) only exists after `initJsPsych()` runs in
   the page body, only reference `jsPsych` **inside functions** that are
   evaluated at trial runtime (function-valued parameters like
   `stimulus: getStim`, `on_finish`, etc.). Plugin constructors
   (`jsPsychHtmlKeyboardResponse`, etc.) are loaded with the page and can be
   used at the top level. Two pitfalls this demo avoids:
   - `jsPsych.timelineVariable(...)` at the top level (instance doesn't exist
     yet) — use function-valued parameters that pop from a pre-shuffled queue.
   - The `repetitions` timeline parameter re-fires `on_timeline_start` on
     every repetition — build a flat repeated timeline array instead.
4. **Data saving is automatic.** When the timeline finishes, the deploy page
   POSTs `jsPsych.data` to the server. To also sync data mid-experiment, call
   `window.dataSync()` (this demo does so before the end screen).

## Deploying to https://deploy.expfactory.org/

1. Push this repository to GitHub.
2. Log in to <https://deploy.expfactory.org/>, go to the experiments section,
   and add a new experiment repository using the GitHub URL
   (e.g. `https://github.com/<user>/expfactory-task-demo`). The server clones
   the repo and discovers `flanker_demo` via its `config.json`.
3. Add the experiment to a battery and open the battery link (or use the
   experiment preview) to run it.

## Running locally

Using [`expfactory-deploy-local`](https://github.com/expfactory/expfactory-deploy)
(see the `expfactory_deploy_local` package):

```bash
pip install -e ./expfactory-deploy-local   # from the expfactory-deploy repo
expfactory_deploy_local -e flanker_demo    # from this repo's directory
```

then open <http://0.0.0.0:8080/> in Chrome or Firefox.

## Creating a new experiment (quickstart)

Requires [uv](https://docs.astral.sh/uv/). From the root of this repository:

```bash
uv run create_experiment.py
```

The script prompts for the required fields (experiment id, display name,
contributors, estimated minutes) and creates a new folder
`<exp_id>/` containing `config.json`, `experiment.js`, and `style.css`. The
generated experiment is a copy of `flanker_demo` with the exp_id placeholders
filled in — a working task you can deploy immediately and then customize. It
uses only the Python standard library; `uv run` executes it without any
environment setup.

Then commit, push, and pull the latest commit into your experiment repository
on <https://deploy.expfactory.org/> to make the new experiment available to
batteries.

## Making your own task from this template (manually)

1. Copy `flanker_demo/` to a new folder, e.g. `my_task/`.
2. Rename `exp_id` in `config.json` to `my_task`.
3. In `experiment.js`, rename `flanker_demo_experiment` → `my_task_experiment`
   and `flanker_demo_init` → `my_task_init`, and update `expID`.
4. Replace the stimuli, trial definitions, and timing with your own.
